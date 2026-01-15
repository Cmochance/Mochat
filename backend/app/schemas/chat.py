"""
对话相关的Pydantic模型
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    """会话创建模型"""
    title: str = Field(default="新对话", max_length=200)


class SessionUpdate(BaseModel):
    """会话更新模型"""
    title: Optional[str] = Field(None, max_length=200)


class SessionResponse(BaseModel):
    """会话响应模型"""
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    """消息创建模型"""
    session_id: int
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., min_length=1)
    thinking: Optional[str] = None


class MessageResponse(BaseModel):
    """消息响应模型"""
    id: int
    role: str
    content: str
    thinking: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    """对话请求模型"""
    session_id: int
    content: str = Field(..., min_length=1)
    model: Optional[str] = None  # 可选模型，不传则使用默认


class ModelInfo(BaseModel):
    """模型信息"""
    id: str
    name: str
    owned_by: Optional[str] = None


class ModelsResponse(BaseModel):
    """模型列表响应"""
    models: List[ModelInfo]
    default_model: str


class ChatStreamChunk(BaseModel):
    """流式对话块模型"""
    type: str  # thinking, content, done, error
    data: str


class SessionWithMessages(SessionResponse):
    """带消息的会话响应"""
    messages: List[MessageResponse] = []


class MessagesPaginatedResponse(BaseModel):
    """分页消息响应模型"""
    messages: List[MessageResponse]
    has_more: bool
    total: int
