"""
对话API路由 - 处理对话相关请求，支持流式输出
"""
import json
import os
import tempfile
import asyncio
import uuid
from datetime import datetime
from typing import List
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..db.database import get_db
from ..schemas.chat import (
    SessionCreate, 
    SessionResponse, 
    SessionUpdate,
    MessageResponse,
    MessagesPaginatedResponse,
    ChatRequest,
    ModelsResponse,
    ModelInfo,
    MessageCreate
)
from ..services.chat_service import chat_service
from ..services.ai_service import ai_service
from ..services.usage_service import usage_service
from ..db import crud
from ..core.dependencies import get_current_active_user
from ..core.config import settings
from ..db.models import User

router = APIRouter()

# 自定义模板路径
CUSTOM_REFERENCE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "custom_reference.docx")


class ImageGenerateRequest(BaseModel):
    """图像生成网关请求"""
    prompt: str
    size: str = "1024x1024"
    quality: str = "standard"
    user_id: str | None = None  # 仅兼容旧参数，网关会忽略


class PPTGenerateRequest(BaseModel):
    """PPT 生成网关请求"""
    prompt: str
    user_id: str | None = None  # 仅兼容旧参数，网关会忽略


def _resolve_request_id(x_request_id: str | None) -> str:
    return (x_request_id or "").strip() or str(uuid.uuid4())


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/models", response_model=ModelsResponse)
async def get_models(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """获取可用的AI模型列表（仅返回管理员配置的模型）"""
    # 获取 API 提供的所有模型
    all_models_data = await ai_service.get_models()
    
    # 获取数据库中允许的模型列表
    allowed_models = await crud.get_all_allowed_models(db, active_only=True)
    
    if allowed_models:
        # 如果数据库中有配置，则只返回允许的模型
        allowed_ids = {m.model_id for m in allowed_models}
        # 保留顺序，使用 allowed_models 的排序
        models = []
        for allowed in allowed_models:
            # 查找匹配的模型
            for m in all_models_data:
                if m["id"] == allowed.model_id:
                    models.append(ModelInfo(
                        id=m["id"],
                        name=allowed.display_name or m["name"],  # 使用自定义名称
                        owned_by=m.get("owned_by")
                    ))
                    break
            else:
                # 如果 API 列表中没有，仍然添加（可能是自定义模型）
                models.append(ModelInfo(
                    id=allowed.model_id,
                    name=allowed.display_name or allowed.model_id,
                    owned_by=None
                ))
    else:
        # 如果数据库中没有配置，返回所有模型（后向兼容）
        models = [ModelInfo(**m) for m in all_models_data]
    
    return ModelsResponse(
        models=models,
        default_model=ai_service.default_model
    )


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


@router.get("/sessions/{session_id}/messages", response_model=MessagesPaginatedResponse)
async def get_messages(
    session_id: int,
    limit: int = 10,
    before_id: int = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取会话的消息历史（支持分页）
    
    Args:
        session_id: 会话 ID
        limit: 获取数量（默认 10）
        before_id: 获取此 ID 之前的消息（用于加载更早的消息）
    """
    result = await chat_service.get_session_messages_paginated(
        db, session_id, current_user, limit, before_id
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    return result


@router.post("/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def save_message(
    request: MessageCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    直接保存消息到数据库（不经过AI生成流程）
    用于保存绘图、PPT等非AI对话生成的消息
    """
    # 验证会话是否存在且属于当前用户
    session = await chat_service.get_session(db, request.session_id, current_user)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在或无权访问"
        )
    
    message = await crud.create_message(
        db,
        request.session_id,
        request.role,
        request.content,
        request.thinking
    )
    return message


@router.post("/completions")
async def chat_completions(
    request: ChatRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
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
    request_id = _resolve_request_id(x_request_id)

    # 检查对话限额
    can_send, error_msg = await usage_service.check_chat_limit(db, current_user)
    if not can_send:
        await usage_service.record_usage_event(
            db,
            user=current_user,
            action="chat",
            status="failed",
            request_id=request_id,
            session_id=request.session_id,
            error_code="chat_limit_exceeded",
            source="chat_completions",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error_msg
        )

    async def generate():
        stream_success = True
        error_code = None
        started_at = datetime.utcnow()
        try:
            async for chunk in chat_service.send_message_stream(
                db, request.session_id, current_user, request.content, request.model
            ):
                if chunk.get("type") == "error":
                    stream_success = False
                    error_code = "chat_stream_error"
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                # 强制事件循环立即处理，确保数据被发送
                await asyncio.sleep(0)
        except asyncio.CancelledError:
            stream_success = False
            error_code = "chat_stream_cancelled"
            raise
        except Exception:
            stream_success = False
            error_code = "chat_stream_exception"
            raise
        finally:
            status_value = "success" if stream_success else "failed"
            await usage_service.record_usage_event(
                db,
                user=current_user,
                action="chat",
                status=status_value,
                request_id=request_id,
                session_id=request.session_id,
                error_code=error_code,
                source="chat_completions",
                occurred_at=started_at,
            )
            await db.commit()
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream; charset=utf-8",
            "X-Request-ID": request_id,
        }
    )


@router.post("/image/generate/stream")
async def generate_image_stream(
    request: ImageGenerateRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """图像生成网关（经主后端记账并转发到微服务）"""
    request_id = _resolve_request_id(x_request_id)

    can_send, error_msg = await usage_service.check_image_limit(db, current_user)
    if not can_send:
        await usage_service.record_usage_event(
            db,
            user=current_user,
            action="image",
            status="failed",
            request_id=request_id,
            error_code="image_limit_exceeded",
            source="chat_image_gateway",
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=error_msg)

    async def generate():
        stream_success = False
        error_code = None
        started_at = datetime.utcnow()

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{settings.PICGEN_INTERNAL_URL}/api/generate/stream",
                    headers={"X-Request-ID": request_id},
                    json={
                        "prompt": request.prompt,
                        "size": request.size,
                        "quality": request.quality,
                        "user_id": str(current_user.id),  # 强制使用鉴权用户
                    },
                ) as upstream:
                    if upstream.status_code >= 400:
                        error_code = f"image_upstream_http_{upstream.status_code}"
                        yield _sse({"type": "error", "data": f"图像服务调用失败（{upstream.status_code}）"})
                        yield _sse({"type": "done", "data": ""})
                        return

                    async for line in upstream.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue

                        payload_raw = line[6:]
                        try:
                            payload = json.loads(payload_raw)
                        except json.JSONDecodeError:
                            continue

                        event_type = payload.get("type")
                        if event_type == "content":
                            result = payload.get("data") if isinstance(payload.get("data"), dict) else None
                            if result and result.get("success"):
                                stream_success = True
                            elif result and result.get("success") is False:
                                error_code = "image_generation_failed"
                        elif event_type == "error":
                            error_code = "image_upstream_error"

                        yield _sse(payload)
        except asyncio.CancelledError:
            stream_success = False
            error_code = "image_stream_cancelled"
            raise
        except Exception as exc:
            stream_success = False
            error_code = "image_gateway_exception"
            yield _sse({"type": "error", "data": f"图像网关异常: {str(exc)}"})
            yield _sse({"type": "done", "data": ""})
        finally:
            await usage_service.record_usage_event(
                db,
                user=current_user,
                action="image",
                status="success" if stream_success else "failed",
                request_id=request_id,
                error_code=None if stream_success else error_code,
                source="chat_image_gateway",
                occurred_at=started_at,
            )
            await db.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream; charset=utf-8",
            "X-Request-ID": request_id,
        },
    )


@router.post("/image/generate")
async def generate_image(
    request: ImageGenerateRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """图像生成同步网关（兼容旧调用）"""
    request_id = _resolve_request_id(x_request_id)

    can_send, error_msg = await usage_service.check_image_limit(db, current_user)
    if not can_send:
        await usage_service.record_usage_event(
            db,
            user=current_user,
            action="image",
            status="failed",
            request_id=request_id,
            error_code="image_limit_exceeded",
            source="chat_image_gateway_sync",
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=error_msg)

    started_at = datetime.utcnow()
    stream_success = False
    error_code = None
    response_data = {}
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            upstream = await client.post(
                f"{settings.PICGEN_INTERNAL_URL}/api/generate",
                headers={"X-Request-ID": request_id},
                json={
                    "prompt": request.prompt,
                    "size": request.size,
                    "quality": request.quality,
                    "user_id": str(current_user.id),
                },
            )
        if upstream.status_code >= 400:
            error_code = f"image_upstream_http_{upstream.status_code}"
            raise HTTPException(status_code=upstream.status_code, detail="图像服务调用失败")

        response_data = upstream.json() if upstream.content else {}
        stream_success = bool(response_data.get("success") and response_data.get("image_url"))
        if not stream_success:
            error_code = "image_generation_failed"
        return response_data
    except HTTPException:
        raise
    except Exception as exc:
        error_code = "image_gateway_exception"
        raise HTTPException(status_code=500, detail=f"图像网关异常: {str(exc)}")
    finally:
        await usage_service.record_usage_event(
            db,
            user=current_user,
            action="image",
            status="success" if stream_success else "failed",
            request_id=request_id,
            error_code=None if stream_success else error_code,
            source="chat_image_gateway_sync",
            occurred_at=started_at,
        )
        await db.commit()


@router.post("/ppt/generate/stream")
async def generate_ppt_stream(
    request: PPTGenerateRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """PPT 生成网关（经主后端记账并转发到微服务）"""
    request_id = _resolve_request_id(x_request_id)

    async def generate():
        stream_success = False
        error_code = None
        started_at = datetime.utcnow()

        try:
            async with httpx.AsyncClient(timeout=360.0) as client:
                async with client.stream(
                    "POST",
                    f"{settings.PPTGEN_INTERNAL_URL}/api/generate/stream",
                    headers={"X-Request-ID": request_id},
                    json={
                        "prompt": request.prompt,
                        "user_id": str(current_user.id),  # 强制使用鉴权用户
                    },
                ) as upstream:
                    if upstream.status_code >= 400:
                        error_code = f"ppt_upstream_http_{upstream.status_code}"
                        yield _sse({"type": "error", "data": f"PPT 服务调用失败（{upstream.status_code}）"})
                        yield _sse({"type": "done", "data": ""})
                        return

                    async for line in upstream.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue

                        payload_raw = line[6:]
                        try:
                            payload = json.loads(payload_raw)
                        except json.JSONDecodeError:
                            continue

                        event_type = payload.get("type")
                        if event_type == "content":
                            result = payload.get("data") if isinstance(payload.get("data"), dict) else None
                            if result and result.get("success"):
                                stream_success = True
                            elif result and result.get("success") is False:
                                error_code = "ppt_generation_failed"
                        elif event_type == "error":
                            error_code = "ppt_upstream_error"

                        yield _sse(payload)
        except asyncio.CancelledError:
            stream_success = False
            error_code = "ppt_stream_cancelled"
            raise
        except Exception as exc:
            stream_success = False
            error_code = "ppt_gateway_exception"
            yield _sse({"type": "error", "data": f"PPT 网关异常: {str(exc)}"})
            yield _sse({"type": "done", "data": ""})
        finally:
            await usage_service.record_usage_event(
                db,
                user=current_user,
                action="ppt",
                status="success" if stream_success else "failed",
                request_id=request_id,
                error_code=None if stream_success else error_code,
                source="chat_ppt_gateway",
                occurred_at=started_at,
            )
            await db.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream; charset=utf-8",
            "X-Request-ID": request_id,
        },
    )


@router.post("/ppt/generate")
async def generate_ppt(
    request: PPTGenerateRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """PPT 生成同步网关（兼容旧调用）"""
    request_id = _resolve_request_id(x_request_id)
    started_at = datetime.utcnow()
    stream_success = False
    error_code = None

    try:
        async with httpx.AsyncClient(timeout=360.0) as client:
            upstream = await client.post(
                f"{settings.PPTGEN_INTERNAL_URL}/api/generate",
                headers={"X-Request-ID": request_id},
                json={
                    "prompt": request.prompt,
                    "user_id": str(current_user.id),
                },
            )
        if upstream.status_code >= 400:
            error_code = f"ppt_upstream_http_{upstream.status_code}"
            raise HTTPException(status_code=upstream.status_code, detail="PPT 服务调用失败")

        response_data = upstream.json() if upstream.content else {}
        stream_success = bool(response_data.get("success") and response_data.get("pptUrl"))
        if not stream_success:
            error_code = "ppt_generation_failed"
        return response_data
    except HTTPException:
        raise
    except Exception as exc:
        error_code = "ppt_gateway_exception"
        raise HTTPException(status_code=500, detail=f"PPT 网关异常: {str(exc)}")
    finally:
        await usage_service.record_usage_event(
            db,
            user=current_user,
            action="ppt",
            status="success" if stream_success else "failed",
            request_id=request_id,
            error_code=None if stream_success else error_code,
            source="chat_ppt_gateway_sync",
            occurred_at=started_at,
        )
        await db.commit()


@router.post("/sessions/{session_id}/regenerate")
async def regenerate_response(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """重新生成最后一条AI响应（SSE流式输出）"""
    import asyncio
    
    async def generate():
        async for chunk in chat_service.regenerate_response(
            db, session_id, current_user
        ):
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            # 强制事件循环立即处理，确保数据被发送
            await asyncio.sleep(0)
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream; charset=utf-8",
        }
    )


class ExportRequest(BaseModel):
    """导出请求"""
    content: str
    filename: str = "export"


@router.post("/export/docx")
async def export_to_docx(
    request: ExportRequest,
    current_user: User = Depends(get_current_active_user)
):
    """
    将 Markdown 内容导出为 Word 文档
    
    使用 pandoc 和自定义模板进行转换
    """
    import pypandoc
    from fastapi.responses import Response
    
    md_path = None
    docx_path = None
    
    try:
        # 创建临时文件
        with tempfile.NamedTemporaryFile(
            mode='w', 
            suffix='.md', 
            delete=False, 
            encoding='utf-8'
        ) as md_file:
            md_file.write(request.content)
            md_path = md_file.name
        
        # 输出文件路径
        docx_path = md_path.replace('.md', '.docx')
        
        # 构建 pandoc 参数
        extra_args = ['--wrap=none']
        
        # 如果存在自定义模板，使用它
        if os.path.exists(CUSTOM_REFERENCE_PATH):
            extra_args.append(f'--reference-doc={CUSTOM_REFERENCE_PATH}')
        
        # 使用 pypandoc 转换
        pypandoc.convert_file(
            md_path,
            'docx',
            outputfile=docx_path,
            extra_args=extra_args
        )
        
        # 读取生成的文件内容
        with open(docx_path, 'rb') as f:
            docx_content = f.read()
        
        # 清理临时文件
        os.unlink(md_path)
        os.unlink(docx_path)
        
        # 安全的文件名（处理中文）
        from urllib.parse import quote
        filename = f"{request.filename}.docx"
        # ASCII 回退文件名（用于不支持 RFC 5987 的客户端）
        ascii_filename = "export.docx"
        # UTF-8 编码的文件名
        encoded_filename = quote(filename, safe='')
        
        # 返回文件内容
        # 同时提供 filename 和 filename* 以兼容不同浏览器
        return Response(
            content=docx_content,
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={
                'Content-Disposition': f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'
            }
        )
        
    except Exception as e:
        # 清理临时文件
        if md_path and os.path.exists(md_path):
            os.unlink(md_path)
        if docx_path and os.path.exists(docx_path):
            os.unlink(docx_path)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"导出失败: {str(e)}"
        )
