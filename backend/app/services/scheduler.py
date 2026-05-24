"""MVP scheduled runs — checks agents with cron-like schedules."""

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.run import Run
from app.models.workflow import Workflow
from app.services.queue import enqueue_run

logger = logging.getLogger(__name__)


def process_due_schedules(db: Session) -> int:
    """Start a run for agents whose schedule interval has elapsed (simplified)."""
    count = 0
    agents = db.query(Agent).all()
    workflow = db.query(Workflow).first()
    if not workflow:
        return 0

    now = datetime.now(timezone.utc)
    for agent in agents:
        schedules = (agent.config or {}).get("schedules", [])
        for sched in schedules:
            if not sched.get("enabled"):
                continue
            last_key = f"last_schedule_{sched.get('id', 'default')}"
            last_run = (agent.config or {}).get(last_key)
            interval_min = sched.get("interval_minutes", 60)
            if last_run:
                try:
                    last_dt = datetime.fromisoformat(last_run.replace("Z", "+00:00"))
                    if (now - last_dt).total_seconds() < interval_min * 60:
                        continue
                except ValueError:
                    pass
            run = Run(
                workflow_id=workflow.id,
                input_task=sched.get("task", f"Scheduled run for {agent.name}"),
                status="pending",
            )
            db.add(run)
            db.commit()
            enqueue_run(run.id)
            cfg = dict(agent.config or {})
            cfg[last_key] = now.isoformat()
            agent.config = cfg
            db.commit()
            count += 1
            logger.info("Scheduled run %s for agent %s", run.id, agent.name)
    return count
