import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.message import Message
from app.models.run import Run, RunStep
from app.schemas.message import MessageResponse
from app.schemas.run import RunChatCreate, RunCreate, RunResponse
from app.services.messages import persist_message
from app.services.queue import enqueue_run, subscribe_run_events
from app.runtime.executor import execute_run

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("", response_model=list[RunResponse])
def list_runs(db: Session = Depends(get_db)):
    runs = (
        db.query(Run)
        .options(joinedload(Run.steps), joinedload(Run.events))
        .order_by(Run.created_at.desc())
        .limit(50)
        .all()
    )
    return runs


@router.post("", response_model=RunResponse, status_code=201)
def create_run(payload: RunCreate, db: Session = Depends(get_db), sync: bool = False):
    run = Run(workflow_id=payload.workflow_id, input_task=payload.input_task, status="pending")
    db.add(run)
    db.commit()
    db.refresh(run)
    if payload.input_task.strip():
        persist_message(
            db,
            content=payload.input_task.strip(),
            sender_type="human",
            channel="run",
            run_id=run.id,
            thread_id=str(run.id),
            metadata={"kind": "task", "turn": 1},
        )
    if sync:
        execute_run(db, run.id)
        db.refresh(run)
    else:
        enqueue_run(run.id)
    return db.query(Run).options(joinedload(Run.steps), joinedload(Run.events)).filter(Run.id == run.id).first()


@router.post("/{run_id}/execute", response_model=RunResponse)
def execute_run_sync(run_id: UUID, db: Session = Depends(get_db)):
    execute_run(db, run_id)
    run = (
        db.query(Run)
        .options(joinedload(Run.steps), joinedload(Run.events))
        .filter(Run.id == run_id)
        .first()
    )
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.post("/{run_id}/chat", response_model=MessageResponse, status_code=201)
def send_run_chat(run_id: UUID, payload: RunChatCreate, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status == "running":
        raise HTTPException(409, "Run is still executing")
    content = payload.content.strip()
    if not content:
        raise HTTPException(400, "Message cannot be empty")

    human_count = (
        db.query(Message)
        .filter(Message.run_id == run_id, Message.sender_type == "human")
        .count()
    )
    msg = persist_message(
        db,
        content=content,
        sender_type="human",
        channel="run",
        run_id=run_id,
        thread_id=str(run_id),
        metadata={"turn": human_count + 1},
    )
    run.input_task = content
    run.status = "pending"
    run.error_message = None
    run.completed_at = None
    db.query(RunStep).filter(RunStep.run_id == run_id).delete()
    db.commit()
    enqueue_run(run.id)
    return msg


@router.get("/{run_id}/messages", response_model=list[MessageResponse])
def list_run_messages(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    return (
        db.query(Message)
        .filter(Message.run_id == run_id)
        .order_by(Message.created_at.asc())
        .limit(500)
        .all()
    )


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: UUID, db: Session = Depends(get_db)):
    run = (
        db.query(Run)
        .options(joinedload(Run.steps), joinedload(Run.events))
        .filter(Run.id == run_id)
        .first()
    )
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.delete("/{run_id}", status_code=204)
def delete_run(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    db.query(Message).filter(Message.run_id == run_id).update({Message.run_id: None})
    db.delete(run)
    db.commit()


@router.get("/{run_id}/events/stream")
async def stream_run_events(run_id: UUID):
    pubsub = subscribe_run_events(run_id)

    async def event_generator():
        try:
            while True:
                message = await asyncio.to_thread(pubsub.get_message, timeout=1.0)
                if message and message["type"] == "message":
                    data = json.loads(message["data"])
                    yield f"data: {json.dumps(data)}\n\n"
                await asyncio.sleep(0.1)
        finally:
            pubsub.unsubscribe()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
