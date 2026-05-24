from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class WorkflowDefinition(BaseModel):
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)


class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    definition: WorkflowDefinition = Field(default_factory=WorkflowDefinition)


class WorkflowResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    definition: dict
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkflowTemplateResponse(BaseModel):
    id: UUID
    slug: str
    name: str
    description: str
    definition: dict
    is_builtin: bool

    model_config = {"from_attributes": True}
