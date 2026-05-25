from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.workflow import Workflow, WorkflowTemplate
from app.schemas.workflow import WorkflowCreate, WorkflowResponse, WorkflowTemplateResponse

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("/templates", response_model=list[WorkflowTemplateResponse])
def list_templates(db: Session = Depends(get_db)):
    return db.query(WorkflowTemplate).order_by(WorkflowTemplate.name).all()


@router.post("/from-template/{slug}", response_model=WorkflowResponse, status_code=201)
def create_from_template(slug: str, db: Session = Depends(get_db)):
    tpl = db.query(WorkflowTemplate).filter(WorkflowTemplate.slug == slug).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    wf = Workflow(
        name=tpl.name,
        description=tpl.description,
        definition=tpl.definition,
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)
    return wf


@router.delete("/templates/{slug}", status_code=204)
def delete_template(slug: str, db: Session = Depends(get_db)):
    tpl = db.query(WorkflowTemplate).filter(WorkflowTemplate.slug == slug).first()
    if not tpl:
        raise HTTPException(404, "Template not found")
    db.delete(tpl)
    db.commit()


@router.get("", response_model=list[WorkflowResponse])
def list_workflows(db: Session = Depends(get_db)):
    return db.query(Workflow).order_by(Workflow.updated_at.desc()).all()


@router.post("", response_model=WorkflowResponse, status_code=201)
def create_workflow(payload: WorkflowCreate, db: Session = Depends(get_db)):
    wf = Workflow(
        name=payload.name,
        description=payload.description,
        definition=payload.definition.model_dump(),
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)
    return wf


@router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(workflow_id: UUID, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return wf


@router.put("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(workflow_id: UUID, payload: WorkflowCreate, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")
    wf.name = payload.name
    wf.description = payload.description
    wf.definition = payload.definition.model_dump()
    wf.version += 1
    db.commit()
    db.refresh(wf)
    return wf


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: UUID, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")
    db.delete(wf)
    db.commit()
