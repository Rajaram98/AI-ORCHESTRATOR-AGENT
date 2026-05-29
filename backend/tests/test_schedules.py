import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest


def test_create_and_list_schedule(client):
    a = client.post("/api/agents", json={"name": "S Agent", "tools": []}).json()
    wf = client.post(
        "/api/workflows",
        json={
            "name": "Scheduled WF",
            "definition": {
                "nodes": [
                    {"id": "n1", "type": "agent", "agent_id": a["id"], "is_entry": True},
                    {"id": "end", "type": "end"},
                ],
                "edges": [{"source": "n1", "target": "end"}],
            },
        },
    ).json()

    run_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    r = client.post(
        "/api/schedules",
        json={
            "workflow_id": wf["id"],
            "input_task": "Daily summary",
            "schedule_type": "once",
            "scheduled_at": run_at,
        },
    )
    assert r.status_code == 201
    sched = r.json()
    assert sched["workflow_id"] == wf["id"]
    assert sched["enabled"] is True

    listed = client.get("/api/schedules", params={"workflow_id": wf["id"]}).json()
    assert len(listed) == 1
    assert listed[0]["input_task"] == "Daily summary"


def test_process_due_schedule(client, db_engine):
    from sqlalchemy.orm import sessionmaker

    from app.models.schedule import WorkflowSchedule
    from app.services.workflow_schedules import process_due_workflow_schedules

    a = client.post("/api/agents", json={"name": "Due Agent", "tools": []}).json()
    wf = client.post(
        "/api/workflows",
        json={
            "name": "Due WF",
            "definition": {
                "nodes": [
                    {"id": "n1", "type": "agent", "agent_id": a["id"], "is_entry": True},
                    {"id": "end", "type": "end"},
                ],
                "edges": [{"source": "n1", "target": "end"}],
            },
        },
    ).json()

    Session = sessionmaker(bind=db_engine)
    db = Session()
    try:
        schedule = WorkflowSchedule(
            id=uuid.uuid4(),
            workflow_id=uuid.UUID(wf["id"]),
            input_task="Run now",
            schedule_type="once",
            scheduled_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            enabled=True,
            next_run_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        db.add(schedule)
        db.commit()

        with patch("app.services.workflow_schedules.enqueue_run") as mock_enqueue:
            count = process_due_workflow_schedules(db)
            assert count == 1
            mock_enqueue.assert_called_once()

        db.refresh(schedule)
        assert schedule.enabled is False
        assert schedule.last_run_at is not None
    finally:
        db.close()
