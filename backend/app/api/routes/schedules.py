from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.schedule import WorkflowSchedule
from app.models.workflow import Workflow
from app.schemas.schedule import ScheduleCreate, ScheduleResponse, ScheduleUpdate
from app.services.workflow_schedules import apply_schedule_fields, compute_next_run_at

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.get("", response_model=list[ScheduleResponse])
def list_schedules(
    db: Session = Depends(get_db),
    workflow_id: Optional[UUID] = Query(None),
):
    q = db.query(WorkflowSchedule).order_by(WorkflowSchedule.created_at.desc())
    if workflow_id:
        q = q.filter(WorkflowSchedule.workflow_id == workflow_id)
    return q.all()


@router.post("", response_model=ScheduleResponse, status_code=201)
def create_schedule(payload: ScheduleCreate, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == payload.workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")

    schedule = WorkflowSchedule(
        workflow_id=payload.workflow_id,
        input_task=payload.input_task,
        schedule_type=payload.schedule_type,
        scheduled_at=payload.scheduled_at,
        interval_minutes=payload.interval_minutes,
        enabled=payload.enabled,
    )
    apply_schedule_fields(schedule)
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(schedule_id: UUID, payload: ScheduleUpdate, db: Session = Depends(get_db)):
    schedule = db.query(WorkflowSchedule).filter(WorkflowSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(404, "Schedule not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(schedule, key, value)

    if schedule.last_run_at and schedule.schedule_type == "once":
        schedule.enabled = False
        schedule.next_run_at = None
    else:
        apply_schedule_fields(schedule)
        if schedule.schedule_type == "interval" and schedule.enabled and schedule.next_run_at is None:
            schedule.next_run_at = compute_next_run_at(schedule)

    db.commit()
    db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: UUID, db: Session = Depends(get_db)):
    schedule = db.query(WorkflowSchedule).filter(WorkflowSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(404, "Schedule not found")
    db.delete(schedule)
    db.commit()
