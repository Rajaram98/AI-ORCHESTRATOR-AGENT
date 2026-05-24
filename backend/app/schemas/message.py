from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
    id: UUID
    run_id: Optional[UUID]
    thread_id: str
    sender_type: str
    sender_id: Optional[str]
    channel: str
    content: str
    metadata: dict = Field(alias="metadata_", default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}
