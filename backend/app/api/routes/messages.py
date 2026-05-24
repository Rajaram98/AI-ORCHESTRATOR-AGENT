from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.message import Message
from app.schemas.message import MessageResponse

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("", response_model=list[MessageResponse])
def list_messages(
    db: Session = Depends(get_db),
    run_id: Optional[UUID] = None,
    thread_id: Optional[str] = None,
    channel: Optional[str] = None,
    limit: int = Query(100, le=500),
):
    q = db.query(Message).order_by(Message.created_at.desc())
    if run_id:
        q = q.filter(Message.run_id == run_id)
    if thread_id:
        q = q.filter(Message.thread_id == thread_id)
    if channel:
        q = q.filter(Message.channel == channel)
    return q.limit(limit).all()
