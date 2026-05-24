"""Seed workflow templates and demo agents."""

import uuid

from app.database import SessionLocal
from app.models.agent import Agent
from app.models.workflow import WorkflowTemplate


RESEARCHER_WRITER = {
    "nodes": [
        {"id": "researcher", "type": "agent", "agent_id": None, "label": "Researcher", "position": {"x": 100, "y": 100}, "is_entry": True},
        {"id": "writer", "type": "agent", "agent_id": None, "label": "Writer", "position": {"x": 400, "y": 100}},
        {"id": "end", "type": "end", "label": "End", "position": {"x": 700, "y": 100}},
    ],
    "edges": [
        {"source": "researcher", "target": "writer"},
        {"source": "writer", "target": "end"},
    ],
}

PLANNER_EXECUTOR_REVIEWER = {
    "nodes": [
        {"id": "planner", "type": "agent", "agent_id": None, "label": "Planner", "position": {"x": 80, "y": 120}, "is_entry": True},
        {"id": "executor", "type": "agent", "agent_id": None, "label": "Executor", "position": {"x": 320, "y": 120}},
        {"id": "reviewer", "type": "agent", "agent_id": None, "label": "Reviewer", "position": {"x": 560, "y": 120}},
        {"id": "end", "type": "end", "label": "End", "position": {"x": 800, "y": 120}},
    ],
    "edges": [
        {"source": "planner", "target": "executor"},
        {"source": "executor", "target": "reviewer"},
        {"source": "reviewer", "target": "end", "condition": True, "label": "default"},
        {"source": "reviewer", "target": "executor", "condition": True, "label": "revise"},
    ],
}


def seed():
    db = SessionLocal()
    try:
        if db.query(WorkflowTemplate).count() == 0:
            db.add(
                WorkflowTemplate(
                    slug="research-writer",
                    name="Research → Writer",
                    description="Researcher gathers facts; Writer produces a polished summary.",
                    definition=RESEARCHER_WRITER,
                )
            )
            db.add(
                WorkflowTemplate(
                    slug="planner-executor-reviewer",
                    name="Planner → Executor → Reviewer",
                    description="Plan a task, execute with tools, review (with optional revise loop).",
                    definition=PLANNER_EXECUTOR_REVIEWER,
                )
            )
            db.commit()

        if db.query(Agent).count() == 0:
            researcher_id = uuid.uuid4()
            writer_id = uuid.uuid4()
            planner_id = uuid.uuid4()
            executor_id = uuid.uuid4()
            reviewer_id = uuid.uuid4()

            agents = [
                Agent(
                    id=researcher_id,
                    name="Researcher",
                    role="researcher",
                    system_prompt="You research topics thoroughly. Use fetch_url_summary when URLs are given. Output bullet facts.",
                    tools=["fetch_url_summary", "write_note"],
                ),
                Agent(
                    id=writer_id,
                    name="Writer",
                    role="writer",
                    system_prompt="You write clear summaries from research context. Produce a structured final answer.",
                    tools=["write_note"],
                ),
                Agent(
                    id=planner_id,
                    name="Planner",
                    role="planner",
                    system_prompt="Break the user task into concrete steps. Output a numbered plan.",
                    tools=[],
                ),
                Agent(
                    id=executor_id,
                    name="Executor",
                    role="executor",
                    system_prompt="Execute the plan using available tools. Use calculator for math.",
                    tools=["calculator", "write_note"],
                ),
                Agent(
                    id=reviewer_id,
                    name="Reviewer",
                    role="reviewer",
                    system_prompt="Review the output. If quality is poor, say 'revise' and explain fixes. Otherwise approve.",
                    tools=[],
                ),
            ]
            for a in agents:
                db.add(a)
            db.commit()

            for tpl in db.query(WorkflowTemplate).all():
                defn = dict(tpl.definition)
                nodes = defn.get("nodes", [])
                if tpl.slug == "research-writer":
                    mapping = {"researcher": researcher_id, "writer": writer_id}
                else:
                    mapping = {
                        "planner": planner_id,
                        "executor": executor_id,
                        "reviewer": reviewer_id,
                    }
                for n in nodes:
                    if n.get("type") == "agent" and n["id"] in mapping:
                        n["agent_id"] = str(mapping[n["id"]])
                tpl.definition = defn
            db.commit()
            print("Seeded agents and templates with agent IDs.")
        else:
            print("Seed skipped — data already exists.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
