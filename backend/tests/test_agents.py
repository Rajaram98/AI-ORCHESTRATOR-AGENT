def test_create_list_update_delete_agent(client):
    r = client.post(
        "/api/agents",
        json={
            "name": "Test Agent",
            "role": "tester",
            "system_prompt": "You test things.",
            "model": "gpt-4o-mini",
            "tools": ["calculator"],
            "config": {"guardrails": {"max_iterations": 5}},
        },
    )
    assert r.status_code == 201
    agent = r.json()
    assert agent["name"] == "Test Agent"
    agent_id = agent["id"]

    r = client.get("/api/agents")
    assert r.status_code == 200
    assert len(r.json()) >= 1

    r = client.patch(f"/api/agents/{agent_id}", json={"name": "Updated Agent"})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated Agent"

    r = client.delete(f"/api/agents/{agent_id}")
    assert r.status_code == 204


def test_list_tools(client):
    r = client.get("/api/agents/tools/list")
    assert r.status_code == 200
    assert any(t["name"] == "calculator" for t in r.json())
