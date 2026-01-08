"""
对话API路由 - 处理对话相关请求，支持流式输出
"""
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..schemas.chat import (
    SessionCreate, 
    SessionResponse, 
    SessionUpdate,
    MessageResponse,
    ChatRequest
)
from ..services.chat_service import chat_service
from ..core.dependencies import get_current_active_user
from ..db.models import User

router = APIRouter()


@router.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户的会话列表"""
    sessions = await chat_service.get_user_sessions(db, current_user, skip, limit)
    return sessions


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    request: SessionCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """创建新会话"""
    session = await chat_service.create_session(db, current_user, request.title)
    return session


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """获取会话详情"""
    session = await chat_service.get_session(db, session_id, current_user)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    return session


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """删除会话"""
    success = await chat_service.delete_session(db, session_id, current_user)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在或无权删除"
        )
    return {"message": "删除成功"}


@router.get("/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """获取会话的消息历史"""
    messages = await chat_service.get_session_messages(db, session_id, current_user)
    if messages is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    return messages


@router.post("/completions")
async def chat_completions(
    request: ChatRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    发送消息并获取AI响应（SSE流式输出）
    
    返回格式：
    data: {"type": "thinking", "data": "..."}
    data: {"type": "content", "data": "..."}
    data: {"type": "done", "data": "..."}
    """
    async def generate():
        async for chunk in chat_service.send_message_stream(
            db, request.session_id, current_user, request.content
        ):
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/sessions/{session_id}/regenerate")
async def regenerate_response(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """重新生成最后一条AI响应（SSE流式输出）"""
    async def generate():
        async for chunk in chat_service.regenerate_response(
            db, session_id, current_user
        ):
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
