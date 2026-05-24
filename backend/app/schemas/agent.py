from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AgentConfig(BaseModel):
    schedules: List[Dict[str, Any]] = Field(default_factory=list)
    memory: Dict[str, Any] = Field(default_factory=lambda: {"enabled": True, "max_turns": 20})
    skills: List[str] = Field(default_factory=list)
    interaction_rules: List[str] = Field(default_factory=list)
    guardrails: Dict[str, Any] = Field(
        default_factory=lambda: {"max_iterations": 10, "max_output_chars": 8000}
    )


class AgentCreate(BaseModel):
    name: str
    role: str = "assistant"
    system_prompt: str = "You are a helpful AI assistant."
    model: str = "gpt-4o-mini"
    tools: List[str] = Field(default_factory=list)
    channels: List[Dict[str, Any]] = Field(default_factory=list)
    config: AgentConfig = Field(default_factory=AgentConfig)


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    tools: Optional[List[str]] = None
    channels: Optional[List[Dict[str, Any]]] = None
    config: Optional[AgentConfig] = None


class AgentResponse(BaseModel):
    id: UUID
    name: str
    role: str
    system_prompt: str
    model: str
    tools: list
    channels: list
    config: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
