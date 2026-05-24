"""Execute workflow runs and persist results."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.run import Run, RunEvent, RunStep
from app.models.workflow import Workflow
from app.runtime.compiler import compile_workflow
from app.services.messages import persist_message
from app.services.queue import publish_run_event

# Rough pricing per 1M tokens for demo cost tracking
COST_PER_1M_PROMPT = 0.15
COST_PER_1M_COMPLETION = 0.60


def _estimate_cost(prompt_tokens: int, completion_tokens: int) -> float:
    return (prompt_tokens / 1_000_000 * COST_PER_1M_PROMPT) + (
        completion_tokens / 1_000_000 * COST_PER_1M_COMPLETION
    )


def _log_event(db: Session, run_id: UUID, event_type: str, payload: dict) -> None:
    ev = RunEvent(run_id=run_id, event_type=event_type, payload=payload)
    db.add(ev)
    db.commit()
    publish_run_event(run_id, event_type, payload)


def execute_run(db: Session, run_id: UUID) -> Run:
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise ValueError(f"Run {run_id} not found")

    workflow = db.query(Workflow).filter(Workflow.id == run.workflow_id).first()
    if not workflow:
        run.status = "failed"
        run.error_message = "Workflow not found"
        db.commit()
        return run

    run.status = "running"
    run.started_at = datetime.now(timezone.utc)
    db.commit()
    _log_event(db, run_id, "run_started", {"workflow_id": str(workflow.id)})

    definition = workflow.definition or {}
    agent_ids = set()
    for node in definition.get("nodes", []):
        if node.get("agent_id"):
            agent_ids.add(UUID(str(node["agent_id"])))

    agents = db.query(Agent).filter(Agent.id.in_(agent_ids)).all() if agent_ids else []
    agents_by_id = {a.id: a for a in agents}

    max_iter = 15
    for node in definition.get("nodes", []):
        if node.get("agent_id") and UUID(str(node["agent_id"])) in agents_by_id:
            g = agents_by_id[UUID(str(node["agent_id"]))].config or {}
            max_iter = g.get("guardrails", {}).get("max_iterations", max_iter)

    try:
        compiled = compile_workflow(definition, agents_by_id, max_iterations=max_iter)

        for node in definition.get("nodes", []):
            if node.get("type") == "agent" and node.get("agent_id"):
                step = RunStep(
                    run_id=run_id,
                    node_id=node["id"],
                    agent_id=UUID(str(node["agent_id"])),
                    status="pending",
                )
                db.add(step)
        db.commit()

        initial_state = {
            "messages": [],
            "task": run.input_task or "",
            "shared_context": "",
            "last_agent_output": "",
            "iteration_count": 0,
            "current_node": "",
        }

        result = compiled.invoke(initial_state)

        prompt_tokens = 0
        completion_tokens = 0
        for msg in result.get("messages", []):
            meta = getattr(msg, "response_metadata", {}) or {}
            usage = meta.get("token_usage") or meta.get("usage", {})
            prompt_tokens += usage.get("prompt_tokens", 0)
            completion_tokens += usage.get("completion_tokens", 0)

        for msg in result.get("messages", []):
            content = msg.content if hasattr(msg, "content") else str(msg)
            name = getattr(msg, "name", None) or "agent"
            persist_message(
                db,
                content=content,
                sender_type="agent",
                sender_id=name,
                channel="internal",
                run_id=run_id,
                thread_id=str(run_id),
            )
            _log_event(
                db,
                run_id,
                "agent_message",
                {"sender": name, "preview": content[:200]},
            )

        for step in db.query(RunStep).filter(RunStep.run_id == run_id).all():
            step.status = "completed"
            step.completed_at = datetime.now(timezone.utc)
            if result.get("last_agent_output"):
                step.output_preview = result["last_agent_output"][:500]

        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        run.context = {
            "shared_context": result.get("shared_context", ""),
            "last_output": result.get("last_agent_output", ""),
        }
        run.total_prompt_tokens = prompt_tokens
        run.total_completion_tokens = completion_tokens
        run.estimated_cost_usd = Decimal(str(_estimate_cost(prompt_tokens, completion_tokens)))
        db.commit()
        _log_event(db, run_id, "run_completed", {"status": "completed"})

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.completed_at = datetime.now(timezone.utc)
        db.commit()
        _log_event(db, run_id, "run_failed", {"error": str(e)})

    return run
