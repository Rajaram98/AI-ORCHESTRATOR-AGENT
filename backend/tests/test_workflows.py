import uuid

from unittest.mock import patch


def _create_two_agents(client):
    ids = []
    for name in ("A1", "A2"):
        r = client.post("/api/agents", json={"name": name, "tools": []})
        ids.append(r.json()["id"])
    return ids


def test_workflow_crud_and_run(client):
    a1, a2 = _create_two_agents(client)
    definition = {
        "nodes": [
            {"id": "n1", "type": "agent", "agent_id": a1, "is_entry": True},
            {"id": "n2", "type": "agent", "agent_id": a2},
            {"id": "end", "type": "end"},
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "end"},
        ],
    }
    r = client.post(
        "/api/workflows",
        json={"name": "Test Flow", "definition": definition},
    )
    assert r.status_code == 201
    wf_id = r.json()["id"]

    with patch("app.api.routes.runs.enqueue_run"):
        r = client.post(
            "/api/runs",
            json={"workflow_id": wf_id, "input_task": "Hello"},
        )
    assert r.status_code == 201
    run_id = r.json()["id"]

    with patch("app.api.routes.runs.execute_run") as mock_exec:
        from app.models.run import Run

        def fake_execute(db, run_id):
            run = db.query(Run).filter(Run.id == uuid.UUID(str(run_id))).first()
            run.status = "completed"
            db.commit()
            return run

        mock_exec.side_effect = fake_execute
        r = client.post(f"/api/runs/{run_id}/execute")
    assert r.status_code == 200
    assert r.json()["status"] == "completed"


def test_messages_list(client, db_engine):
    from sqlalchemy.orm import sessionmaker

    from app.services.messages import persist_message

    Session = sessionmaker(bind=db_engine)
    db = Session()
    try:
        persist_message(
            db,
            content="hello",
            sender_type="human",
            channel="telegram",
            thread_id="tg:123",
        )
        r = client.get("/api/messages", params={"channel": "telegram"})
        assert r.status_code == 200
        assert any(m["content"] == "hello" for m in r.json())
    finally:
        db.close()
