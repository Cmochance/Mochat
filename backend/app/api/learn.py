"""
学习模块 API 路由
"""
import json
import os
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db import crud
from ..db.models import User
from ..core.dependencies import get_current_active_user
from ..core.config import settings
from ..schemas.learn import (
    MaterialTextCreate,
    MaterialResponse,
    MaterialDetailResponse,
    MaterialListResponse,
    StudySessionCreate,
    StudySessionResponse,
    StudySessionListResponse,
    StudyMessageCreate,
    StudyMessageResponse,
    StudyMessagesResponse,
)
from ..services.learn_service import (
    extract_text,
    chunk_text,
    retrieve_relevant_chunks,
    generate_summary,
    study_chat_stream,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# 上传文件存储目录
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "learn")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 允许的文件类型
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".docx"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


# ============ 资料管理 ============


@router.post("/materials/upload", response_model=MaterialResponse)
async def upload_material(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """上传文件创建学习资料"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}，支持: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"文件大小超过限制（最大 {MAX_FILE_SIZE // 1024 // 1024} MB）")

    try:
        file_type, raw_text = extract_text(file.filename, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="文件内容为空或无法提取文本")

    title = os.path.splitext(file.filename)[0]

    # 保存文件到磁盘
    user_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    file_path = os.path.join(user_dir, file.filename)
    with open(file_path, "wb") as f:
        f.write(data)

    # 创建资料记录
    material = await crud.create_learning_material(
        db=db,
        user_id=current_user.id,
        title=title,
        file_type=file_type,
        raw_text=raw_text,
        file_path=file_path,
    )

    # 分块
    chunks = chunk_text(raw_text)
    await crud.create_material_chunks(db=db, material_id=material.id, chunks=chunks)

    return material


@router.post("/materials/text", response_model=MaterialResponse)
async def create_text_material(
    body: MaterialTextCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """通过粘贴文本创建学习资料"""
    material = await crud.create_learning_material(
        db=db,
        user_id=current_user.id,
        title=body.title,
        file_type="text",
        raw_text=body.content,
    )

    chunks = chunk_text(body.content)
    await crud.create_material_chunks(db=db, material_id=material.id, chunks=chunks)

    return material


@router.get("/materials", response_model=MaterialListResponse)
async def list_materials(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取当前用户的学习资料列表"""
    materials = await crud.get_user_materials(db, current_user.id, skip=skip, limit=limit)
    return MaterialListResponse(materials=materials, total=len(materials))


@router.get("/materials/{material_id}", response_model=MaterialDetailResponse)
async def get_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取资料详情"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")
    return material


@router.delete("/materials/{material_id}")
async def delete_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """删除学习资料"""
    ok = await crud.delete_material(db, material_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="资料不存在")
    return {"ok": True}


@router.post("/materials/{material_id}/summary")
async def get_or_generate_summary(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """生成或获取资料摘要"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    if material.summary:
        return {"summary": material.summary}

    summary = await generate_summary(material.raw_text)
    await crud.update_material_summary(db, material_id, summary)
    return {"summary": summary}


# ============ 学习会话 ============


@router.post("/sessions", response_model=StudySessionResponse)
async def create_study_session(
    body: StudySessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """创建学习会话"""
    material = await crud.get_material_by_id(db, body.material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    session = await crud.create_study_session(
        db=db,
        user_id=current_user.id,
        material_id=body.material_id,
        title=body.title,
    )
    return session


@router.get("/sessions", response_model=StudySessionListResponse)
async def list_study_sessions(
    material_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取学习会话列表"""
    sessions = await crud.get_user_study_sessions(db, current_user.id, material_id=material_id)
    return StudySessionListResponse(sessions=sessions)


@router.delete("/sessions/{session_id}")
async def delete_study_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """删除学习会话"""
    ok = await crud.delete_study_session(db, session_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"ok": True}


# ============ 学习对话 ============


@router.get("/sessions/{session_id}/messages", response_model=StudyMessagesResponse)
async def get_study_messages(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取学习会话的消息列表"""
    session = await crud.get_study_session_by_id(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    messages = await crud.get_study_messages(db, session_id)
    return StudyMessagesResponse(messages=messages)


@router.post("/sessions/{session_id}/messages")
async def send_study_message(
    session_id: int,
    body: StudyMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    发送学习提问（SSE 流式返回）。
    同时将用户消息和 AI 回复持久化。
    """
    session = await crud.get_study_session_by_id(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 获取资料分块
    chunks = await crud.get_material_chunks(db, session.material_id)

    # 检索相关分块
    relevant = retrieve_relevant_chunks(body.content, chunks, top_k=5)
    context_texts = [c.content for c, _score in relevant]
    cited_indices = [c.chunk_index for c, _score in relevant]

    # 构建对话历史
    history_msgs = await crud.get_study_messages(db, session_id, limit=20)
    history = [{"role": m.role, "content": m.content} for m in history_msgs]

    # 保存用户消息
    await crud.create_study_message(db, session_id, role="user", content=body.content)

    # 流式生成 AI 回复
    async def event_generator():
        full_content = ""
        full_thinking = ""

        async for chunk in study_chat_stream(
            user_message=body.content,
            context_chunks=context_texts,
            history=history,
            model=body.model,
        ):
            if chunk["type"] == "thinking":
                full_thinking += chunk["data"]
            elif chunk["type"] == "content":
                full_content += chunk["data"]
            # 转发给前端
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        # 保存 AI 回复
        await crud.create_study_message(
            db,
            session_id,
            role="assistant",
            content=full_content,
            thinking=full_thinking if full_thinking else None,
            cited_chunks=json.dumps(cited_indices),
        )

        yield f"data: {json.dumps({'type': 'done', 'data': ''})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
