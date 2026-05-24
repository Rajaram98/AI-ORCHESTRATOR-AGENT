from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.message import Message


def persist_message(
    db: Session,
    *,
    content: str,
    sender_type: str,
    sender_id: str | None = None,
    channel: str = "internal",
    run_id: uuid.UUID | None = None,
    thread_id: str = "default",
    metadata: dict | None = None,
) -> Message:
    msg = Message(
        run_id=run_id,
        thread_id=thread_id,
        sender_type=sender_type,
        sender_id=sender_id,
        channel=channel,
        content=content,
        metadata_=metadata or {},
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg
