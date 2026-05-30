from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
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
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    order_col = Message.created_at.asc() if order == "asc" else Message.created_at.desc()
    q = db.query(Message).order_by(order_col)
    if run_id:
        q = q.filter(Message.run_id == run_id)
    if thread_id:
        q = q.filter(Message.thread_id == thread_id)
    if channel:
        q = q.filter(Message.channel == channel)
    return q.limit(limit).all()


@router.delete("/{message_id}", status_code=204)
def delete_message(message_id: UUID, db: Session = Depends(get_db)):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    db.delete(msg)
    db.commit()
