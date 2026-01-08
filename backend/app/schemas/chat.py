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
    content: str = Field(..., min_length=1)


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


class ChatStreamChunk(BaseModel):
    """流式对话块模型"""
    type: str  # thinking, content, done, error
    data: str


class SessionWithMessages(SessionResponse):
    """带消息的会话响应"""
    messages: List[MessageResponse] = []
