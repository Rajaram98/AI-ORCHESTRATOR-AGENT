from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class RunCreate(BaseModel):
    workflow_id: UUID
    input_task: str = ""


class RunChatCreate(BaseModel):
    content: str


class RunStepResponse(BaseModel):
    id: UUID
    node_id: str
    agent_id: Optional[UUID]
    status: str
    prompt_tokens: int
    completion_tokens: int
    output_preview: Optional[str]

    model_config = {"from_attributes": True}


class RunEventResponse(BaseModel):
    id: UUID
    event_type: str
    payload: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class RunResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    status: str
    input_task: str
    context: dict
    total_prompt_tokens: int
    total_completion_tokens: int
    estimated_cost_usd: float
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    steps: List[RunStepResponse] = []
    events: List[RunEventResponse] = []

    model_config = {"from_attributes": True}
