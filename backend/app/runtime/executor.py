"""Execute workflow runs and persist results."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from langchain_core.messages import BaseMessage, HumanMessage
from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.message import Message
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
    if run.status == "running":
        return run

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
        db.query(RunStep).filter(RunStep.run_id == run_id).delete()
        db.commit()

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

        history = (
            db.query(Message)
            .filter(Message.run_id == run_id)
            .order_by(Message.created_at)
            .all()
        )
        lang_messages: list[BaseMessage] = []
        prior_agent_lines: list[str] = []
        for m in history:
            if m.sender_type == "human":
                lang_messages.append(HumanMessage(content=m.content))
            elif m.sender_type == "agent":
                label = m.sender_id or m.metadata_.get("agent_name") or "agent"
                prior_agent_lines.append(f"[{label}]: {m.content}")

        execution_turn = sum(1 for m in history if m.sender_type == "human")
        prior_context = (run.context or {}).get("shared_context", "") if run.context else ""
        shared_context = prior_context or "\n\n".join(prior_agent_lines).strip()

        agent_outputs: dict[str, str] = {}
        persisted_nodes: set[tuple[int, str]] = set()
        agent_sequence = 0

        def on_agent_output(node_id: str, agent_name: str, content: str) -> None:
            key = (execution_turn, node_id)
            if key in persisted_nodes:
                return
            persisted_nodes.add(key)
            nonlocal agent_sequence
            agent_sequence += 1
            agent_outputs[node_id] = content
            persist_message(
                db,
                content=content,
                sender_type="agent",
                sender_id=agent_name,
                channel="run",
                run_id=run_id,
                thread_id=str(run_id),
                metadata={
                    "workflow_id": str(workflow.id),
                    "node_id": node_id,
                    "agent_name": agent_name,
                    "turn": execution_turn,
                    "sequence": agent_sequence,
                },
            )
            _log_event(
                db,
                run_id,
                "agent_message",
                {
                    "sender": agent_name,
                    "preview": content[:200],
                    "node_id": node_id,
                    "turn": execution_turn,
                    "sequence": agent_sequence,
                },
            )

        compiled = compile_workflow(
            definition, agents_by_id, max_iterations=max_iter, on_agent_output=on_agent_output
        )

        initial_state = {
            "messages": lang_messages,
            "task": run.input_task or "",
            "shared_context": shared_context,
            "last_agent_output": "",
            "iteration_count": 0,
            "current_node": "",
        }

        node_count = len([n for n in definition.get("nodes", []) if n.get("type") == "agent"])
        recursion_limit = max(max_iter, node_count * 3, 10)
        result = compiled.invoke(initial_state, config={"recursion_limit": recursion_limit})

        prompt_tokens = 0
        completion_tokens = 0
        for msg in result.get("messages", []):
            meta = getattr(msg, "response_metadata", {}) or {}
            usage = meta.get("token_usage") or meta.get("usage", {})
            prompt_tokens += usage.get("prompt_tokens", 0)
            completion_tokens += usage.get("completion_tokens", 0)

        final_output = (result.get("last_agent_output") or "").strip()
        if final_output:
            persist_message(
                db,
                content=final_output,
                sender_type="agent",
                sender_id="workflow",
                channel="run",
                run_id=run_id,
                thread_id=str(run_id),
                metadata={
                    "workflow_id": str(workflow.id),
                    "turn": execution_turn,
                    "kind": "workflow_final",
                },
            )

        for step in db.query(RunStep).filter(RunStep.run_id == run_id).all():
            step.status = "completed"
            step.completed_at = datetime.now(timezone.utc)
            if step.node_id in agent_outputs:
                step.output_preview = agent_outputs[step.node_id][:500]
            elif result.get("last_agent_output"):
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
