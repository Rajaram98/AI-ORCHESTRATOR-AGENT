from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class ScheduleCreate(BaseModel):
    workflow_id: UUID
    input_task: str = ""
    schedule_type: Literal["once", "interval"] = "once"
    scheduled_at: Optional[datetime] = None
    interval_minutes: Optional[int] = Field(None, ge=1, le=525600)
    enabled: bool = True

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.schedule_type == "once" and not self.scheduled_at:
            raise ValueError("scheduled_at is required for one-time schedules")
        if self.schedule_type == "interval" and not self.interval_minutes:
            raise ValueError("interval_minutes is required for interval schedules")
        return self


class ScheduleUpdate(BaseModel):
    input_task: Optional[str] = None
    schedule_type: Optional[Literal["once", "interval"]] = None
    scheduled_at: Optional[datetime] = None
    interval_minutes: Optional[int] = Field(None, ge=1, le=525600)
    enabled: Optional[bool] = None


class ScheduleResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    input_task: str
    schedule_type: str
    scheduled_at: Optional[datetime]
    interval_minutes: Optional[int]
    enabled: bool
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
