"""Workflow schedule helpers."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.run import Run
from app.models.schedule import WorkflowSchedule
from app.models.workflow import Workflow
from app.services.messages import persist_message
from app.services.queue import enqueue_run


def compute_next_run_at(schedule: WorkflowSchedule, *, after: datetime | None = None) -> datetime | None:
    now = after or datetime.now(timezone.utc)
    if not schedule.enabled:
        return None
    if schedule.schedule_type == "once":
        if schedule.last_run_at:
            return None
        return schedule.scheduled_at
    if schedule.schedule_type == "interval" and schedule.interval_minutes:
        return now + timedelta(minutes=schedule.interval_minutes)
    return None


def apply_schedule_fields(schedule: WorkflowSchedule) -> None:
    if schedule.schedule_type == "once":
        schedule.interval_minutes = None
        if not schedule.last_run_at:
            schedule.next_run_at = schedule.scheduled_at
        else:
            schedule.next_run_at = None
            schedule.enabled = False
    elif schedule.schedule_type == "interval":
        schedule.scheduled_at = None
        if schedule.next_run_at is None:
            schedule.next_run_at = datetime.now(timezone.utc)


def create_scheduled_run(db: Session, schedule: WorkflowSchedule) -> Run:
    workflow = db.query(Workflow).filter(Workflow.id == schedule.workflow_id).first()
    if not workflow:
        raise ValueError(f"Workflow {schedule.workflow_id} not found")

    task = schedule.input_task or ""
    run = Run(
        workflow_id=schedule.workflow_id,
        input_task=task,
        status="pending",
        context={"schedule_id": str(schedule.id)},
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    if task.strip():
        persist_message(
            db,
            content=task.strip(),
            sender_type="human",
            channel="run",
            run_id=run.id,
            thread_id=str(run.id),
            metadata={"kind": "task", "turn": 1, "schedule_id": str(schedule.id)},
        )

    enqueue_run(run.id)
    return run


def mark_schedule_ran(db: Session, schedule: WorkflowSchedule, ran_at: datetime | None = None) -> None:
    ran_at = ran_at or datetime.now(timezone.utc)
    schedule.last_run_at = ran_at
    if schedule.schedule_type == "once":
        schedule.enabled = False
        schedule.next_run_at = None
    elif schedule.schedule_type == "interval" and schedule.interval_minutes:
        schedule.next_run_at = ran_at + timedelta(minutes=schedule.interval_minutes)
    db.commit()


def process_due_workflow_schedules(db: Session) -> int:
    now = datetime.now(timezone.utc)
    due = (
        db.query(WorkflowSchedule)
        .filter(
            WorkflowSchedule.enabled.is_(True),
            WorkflowSchedule.next_run_at.isnot(None),
            WorkflowSchedule.next_run_at <= now,
        )
        .all()
    )
    count = 0
    for schedule in due:
        try:
            create_scheduled_run(db, schedule)
            mark_schedule_ran(db, schedule, now)
            count += 1
        except Exception:
            db.rollback()
            raise
    return count
