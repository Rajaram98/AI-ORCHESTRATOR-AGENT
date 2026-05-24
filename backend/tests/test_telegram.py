def test_telegram_bind(client):
    r = client.post("/api/agents", json={"name": "TG Bot Agent"})
    agent_id = r.json()["id"]

    r = client.post(
        "/api/telegram/bind",
        json={"agent_id": agent_id, "chat_id": "999888"},
    )
    assert r.status_code == 200
    assert r.json()["chat_id"] == "999888"

    r = client.get("/api/telegram/bindings")
    assert r.status_code == 200
    assert any(b["chat_id"] == "999888" for b in r.json())
