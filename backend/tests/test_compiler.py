from app.runtime.compiler import _condition_router


def test_condition_router_returns_route_labels_not_destinations():
    router = _condition_router({"default", "revise"})

    assert router({"last_agent_output": "Looks good, approved."}) == "default"
    assert router({"last_agent_output": "Please revise the calculation."}) == "revise"
    assert router({"last_agent_output": ""}) == "default"
