from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class GenerateRulesRequest(BaseModel):
    """Request model for rule generation"""

    aggregated_context: Dict[str, Any] = Field(
        ..., description="Complete system capabilities from NestJS server"
    )
    user_intent: str = Field(
        ..., description="Natural language description of desired workflow"
    )
    provider_override: Optional[str] = Field(
        None, description="Optional LLM provider override (anthropic, openai, etc)"
    )


class GenerateRulesBatchRequest(BaseModel):
    """Request model for batch rule generation"""

    aggregated_context: Dict[str, Any]
    intents: List[str] = Field(
        ..., description="List of user intents to generate rules for"
    )


class GenerateRulesResponse(BaseModel):
    """Response model for rule generation"""

    workflow_rules: Dict[str, Any] = Field(
        ..., description="Generated workflow rules (valid JSON)"
    )
    model_used: str = Field(..., description="LLM model that generated the rules")
    tokens_used: int = Field(..., description="Total tokens consumed")
    generation_time_ms: int = Field(
        ..., description="Time taken to generate rules"
    )


class EvaluateConditionRequest(BaseModel):
    """Request model for condition evaluation"""

    condition: str = Field(..., description="Condition expression to evaluate")
    context: Dict[str, Any] = Field(
        ..., description="Runtime context with variables"
    )


class EvaluateConditionResponse(BaseModel):
    """Response model for condition evaluation"""

    result: bool = Field(..., description="Evaluation result (true/false)")
    provider_used: str = Field(...)


class RefineRulesRequest(BaseModel):
    """Request model for rule refinement"""

    current_rules: Dict[str, Any] = Field(..., description="Previously generated rules")
    feedback: str = Field(..., description="User feedback for improvement")
    aggregated_context: Dict[str, Any] = Field(
        ..., description="System capabilities context"
    )


class RefineRulesResponse(BaseModel):
    """Response model for rule refinement"""

    refined_rules: Dict[str, Any]
    tokens_used: int
    changes_summary: str = Field(
        description="Summary of changes made based on feedback"
    )


class HealthResponse(BaseModel):
    """Health check response"""

    status: str
    provider: str
    model: str
    context_cache_age_minutes: Optional[int]


class ProvidersListResponse(BaseModel):
    """List of available providers"""

    available_providers: Dict[str, str]
    current_provider: str
