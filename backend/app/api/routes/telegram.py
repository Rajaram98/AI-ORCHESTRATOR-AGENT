from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.agent import Agent

router = APIRouter(prefix="/telegram", tags=["telegram"])


class TelegramBindRequest(BaseModel):
    agent_id: UUID
    chat_id: str


@router.post("/bind")
def bind_agent_to_chat(payload: TelegramBindRequest, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == payload.agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")
    channels = list(agent.channels or [])
    channels = [c for c in channels if c.get("type") != "telegram"]
    channels.append({"type": "telegram", "chat_id": payload.chat_id})
    agent.channels = channels
    db.commit()
    return {"ok": True, "agent_id": str(agent.id), "chat_id": payload.chat_id}


@router.get("/bindings")
def list_bindings(db: Session = Depends(get_db)):
    agents = db.query(Agent).all()
    bindings = []
    for a in agents:
        for c in a.channels or []:
            if c.get("type") == "telegram" and c.get("chat_id"):
                bindings.append({"agent_id": str(a.id), "agent_name": a.name, "chat_id": c["chat_id"]})
    return bindings
