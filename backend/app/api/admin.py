"""
管理API路由 - 处理后台管理请求
"""
import csv
import io
import json
from datetime import datetime
from typing import List, Dict, Any
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db import crud
from ..schemas.user import UserResponse, UserUpdate, UserAdminResponse, TierUpdateRequest
from ..services.admin_service import admin_service
from ..services.content_filter import content_filter
from ..services.usage_service import usage_service, TIER_LIMITS
from ..services.usage_reconcile_service import usage_reconcile_service
from ..mcp.service import mcp_service
from ..core.dependencies import get_admin_user
from ..db.models import User

router = APIRouter()


# ============ Schemas ============

class KeywordCreate(BaseModel):
    keyword: str


class KeywordResponse(BaseModel):
    id: int
    keyword: str
    is_active: bool
    created_at: str
    
    class Config:
        from_attributes = True


@router.get("/stats")
async def get_system_stats(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """获取系统统计信息"""
    return await admin_service.get_system_stats(db)


@router.get("/users", response_model=List[UserAdminResponse])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """获取所有用户列表（包含密码哈希用于调试）"""
    return await admin_service.get_all_users(db, skip, limit)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    update_data: UserUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """更新用户信息"""
    update_dict = update_data.model_dump(exclude_unset=True)
    user = await admin_service.update_user(db, user_id, **update_dict)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    return user


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """删除用户"""
    success, error = await admin_service.delete_user(db, user_id, current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "删除成功"}


@router.post("/users/{user_id}/toggle-status", response_model=UserResponse)
async def toggle_user_status(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """切换用户状态（启用/禁用）"""
    user, error = await admin_service.toggle_user_status(db, user_id, current_user.id)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return user


@router.get("/config")
async def get_configs(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, str]:
    """获取系统配置"""
    return await admin_service.get_all_configs(db)


class ConfigUpdate(BaseModel):
    value: str


@router.put("/config/{key}")
async def set_config(
    key: str,
    data: ConfigUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """设置系统配置"""
    await admin_service.set_config(db, key, data.value)
    await db.commit()
    return {"message": "配置更新成功"}


# ============ 限制词管理 ============

@router.get("/keywords")
async def get_keywords(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """获取所有限制词"""
    keywords = await crud.get_all_keywords(db)
    return [
        {
            "id": k.id,
            "keyword": k.keyword,
            "is_active": k.is_active,
            "created_at": k.created_at.isoformat() if k.created_at else None
        }
        for k in keywords
    ]


@router.post("/keywords")
async def add_keyword(
    data: KeywordCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """添加限制词"""
    keyword = data.keyword.strip()
    if not keyword:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="关键词不能为空"
        )
    
    result = await crud.add_keyword(db, keyword, current_user.id)
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="关键词已存在"
        )
    
    # 使缓存失效
    content_filter.invalidate_cache()
    
    return {
        "id": result.id,
        "keyword": result.keyword,
        "is_active": result.is_active,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }


@router.delete("/keywords/{keyword_id}")
async def delete_keyword(
    keyword_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """删除限制词"""
    success = await crud.delete_keyword(db, keyword_id)
    await db.commit()
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="关键词不存在"
        )
    
    # 使缓存失效
    content_filter.invalidate_cache()
    
    return {"message": "删除成功"}


@router.post("/keywords/{keyword_id}/toggle")
async def toggle_keyword(
    keyword_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """切换限制词状态"""
    result = await crud.toggle_keyword_status(db, keyword_id)
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="关键词不存在"
        )
    
    # 使缓存失效
    content_filter.invalidate_cache()
    
    return {
        "id": result.id,
        "keyword": result.keyword,
        "is_active": result.is_active,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }


# ============ 模型管理 ============

class ModelCreate(BaseModel):
    model_id: str
    display_name: str = None
    sort_order: int = 0


class ModelSortUpdate(BaseModel):
    sort_order: int


@router.get("/models")
async def get_allowed_models(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """获取所有配置的模型"""
    models = await crud.get_all_allowed_models(db)
    return [
        {
            "id": m.id,
            "model_id": m.model_id,
            "display_name": m.display_name,
            "is_active": m.is_active,
            "sort_order": m.sort_order,
            "created_at": m.created_at.isoformat() if m.created_at else None
        }
        for m in models
    ]


@router.post("/models")
async def add_model(
    data: ModelCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """添加允许的模型"""
    model_id = data.model_id.strip()
    if not model_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="模型ID不能为空"
        )
    
    result = await crud.add_allowed_model(
        db, 
        model_id, 
        data.display_name.strip() if data.display_name else None,
        data.sort_order
    )
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该模型已存在"
        )
    
    return {
        "id": result.id,
        "model_id": result.model_id,
        "display_name": result.display_name,
        "is_active": result.is_active,
        "sort_order": result.sort_order,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }


@router.delete("/models/{model_db_id}")
async def delete_model(
    model_db_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """删除允许的模型"""
    success = await crud.delete_allowed_model(db, model_db_id)
    await db.commit()
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模型不存在"
        )
    
    return {"message": "删除成功"}


@router.post("/models/{model_db_id}/toggle")
async def toggle_model(
    model_db_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """切换模型启用状态"""
    result = await crud.toggle_model_status(db, model_db_id)
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模型不存在"
        )
    
    return {
        "id": result.id,
        "model_id": result.model_id,
        "display_name": result.display_name,
        "is_active": result.is_active,
        "sort_order": result.sort_order,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }


@router.put("/models/{model_db_id}/sort")
async def update_model_sort(
    model_db_id: int,
    data: ModelSortUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """更新模型排序"""
    result = await crud.update_model_sort_order(db, model_db_id, data.sort_order)
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模型不存在"
        )
    
    return {
        "id": result.id,
        "model_id": result.model_id,
        "display_name": result.display_name,
        "is_active": result.is_active,
        "sort_order": result.sort_order,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }


# ============ 用户等级管理 ============

@router.put("/users/{user_id}/tier", response_model=UserResponse)
async def update_user_tier(
    user_id: int,
    data: TierUpdateRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """更新用户等级"""
    # 检查等级是否有效
    if data.tier not in ["free", "pro", "plus"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的用户等级，必须是 free、pro 或 plus"
        )
    
    # 不能修改管理员的等级
    target_user = await crud.get_user_by_id(db, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    if target_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无法修改管理员的等级"
        )
    
    user = await crud.update_user(db, user_id, tier=data.tier)
    await db.commit()
    
    return user


@router.get("/tiers")
async def get_tier_info(
    current_user: User = Depends(get_admin_user)
) -> Dict[str, Any]:
    """获取所有等级配置信息"""
    return {
        "tiers": [
            {
                "id": tier_id,
                "name_zh": info["name_zh"],
                "name_en": info["name_en"],
                "chat_limit": info["chat_limit"],
                "image_limit": info["image_limit"]
            }
            for tier_id, info in TIER_LIMITS.items()
            if tier_id != "admin"  # 不返回管理员等级
        ]
    }


# ============ 使用量统计 ============

@router.get("/usage/stats")
async def get_usage_stats(
    response: Response,
    start_at: datetime | None = Query(default=None),
    end_at: datetime | None = Query(default=None),
    action: str | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """获取所有用户的使用量统计"""
    result = await usage_service.get_usage_stats(
        db,
        start_at=start_at,
        end_at=end_at,
        action=action,
        status=status,
        q=q,
        page=page,
        page_size=page_size,
    )
    response.headers["X-Total-Count"] = str(result["total"])
    response.headers["X-Page"] = str(result["page"])
    response.headers["X-Page-Size"] = str(result["page_size"])
    return result["items"]


@router.get("/usage/events")
async def get_usage_events(
    start_at: datetime | None = Query(default=None),
    end_at: datetime | None = Query(default=None),
    action: str | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """分页查询使用量事件流水"""
    return await usage_service.list_usage_events(
        db,
        start_at=start_at,
        end_at=end_at,
        action=action,
        status=status,
        q=q,
        user_id=user_id,
        page=page,
        page_size=page_size,
    )


@router.get("/usage/export")
async def export_usage_events(
    start_at: datetime | None = Query(default=None),
    end_at: datetime | None = Query(default=None),
    action: str | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """按筛选条件导出使用量事件 CSV"""
    rows = await usage_service.export_usage_events(
        db,
        start_at=start_at,
        end_at=end_at,
        action=action,
        status=status,
        q=q,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id",
        "user_id",
        "username",
        "email",
        "action",
        "status",
        "request_id",
        "session_id",
        "amount",
        "error_code",
        "source",
        "occurred_at",
        "created_at",
    ])
    for row in rows:
        writer.writerow([
            row.get("id"),
            row.get("user_id"),
            row.get("username"),
            row.get("email"),
            row.get("action"),
            row.get("status"),
            row.get("request_id"),
            row.get("session_id"),
            row.get("amount"),
            row.get("error_code"),
            row.get("source"),
            row.get("occurred_at"),
            row.get("created_at"),
        ])

    csv_data = output.getvalue()
    filename = f"usage_events_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/usage/reconcile")
async def reconcile_usage(
    user_id: int | None = Query(default=None),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """执行 usage_events / aggregates / user_usages 对账"""
    return await usage_reconcile_service.reconcile(db, user_id=user_id)


# ============ MCP 管理 ============

class MCPServerCreate(BaseModel):
    name: str
    transport: str  # remote | stdio
    is_active: bool = True
    base_url: str | None = None
    command: str | None = None
    args_json: str | None = None
    env_json: str | None = None
    headers_json: str | None = None
    timeout_ms: int = 15000
    retry_count: int = 1
    bearer_token: str | None = None


class MCPServerUpdate(BaseModel):
    name: str | None = None
    transport: str | None = None
    is_active: bool | None = None
    base_url: str | None = None
    command: str | None = None
    args_json: str | None = None
    env_json: str | None = None
    headers_json: str | None = None
    timeout_ms: int | None = None
    retry_count: int | None = None
    bearer_token: str | None = None
    clear_bearer_token: bool | None = None


class MCPToolFlagUpdate(BaseModel):
    is_enabled: bool | None = None
    requires_approval: bool | None = None


class MCPResourceReadRequest(BaseModel):
    uri: str


class MCPPromptGetRequest(BaseModel):
    name: str
    arguments: dict[str, Any] | None = None


def _validate_http_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="base_url must be a valid http/https URL")
    return url.strip()


def _normalize_json_input(
    *,
    field_name: str,
    raw: str | None,
    expected: str,
) -> str | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"{field_name} must be valid JSON")

    if expected == "array" and not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON array")
    if expected == "object" and not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON object")
    return json.dumps(parsed, ensure_ascii=False)


@router.get("/mcp/servers")
async def get_mcp_servers(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    return await mcp_service.list_admin_servers(db)


@router.post("/mcp/servers")
async def create_mcp_server(
    data: MCPServerCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    transport = data.transport.strip().lower()
    if transport not in {"remote", "stdio"}:
        raise HTTPException(status_code=400, detail="transport must be remote or stdio")
    if transport == "remote" and not data.base_url:
        raise HTTPException(status_code=400, detail="base_url is required for remote transport")
    if transport == "stdio" and not data.command:
        raise HTTPException(status_code=400, detail="command is required for stdio transport")

    base_url = _validate_http_url(data.base_url) if transport == "remote" and data.base_url else None
    args_json = _normalize_json_input(field_name="args_json", raw=data.args_json, expected="array")
    env_json = _normalize_json_input(field_name="env_json", raw=data.env_json, expected="object")
    headers_json = _normalize_json_input(field_name="headers_json", raw=data.headers_json, expected="object")

    server = await mcp_service.create_server(
        db,
        name=data.name.strip(),
        transport=transport,
        is_active=data.is_active,
        base_url=base_url,
        command=data.command.strip() if data.command else None,
        args_json=args_json,
        env_json=env_json,
        headers_json=headers_json,
        timeout_ms=data.timeout_ms,
        retry_count=data.retry_count,
        bearer_token=data.bearer_token,
    )
    if not server:
        raise HTTPException(status_code=400, detail="MCP server name already exists")
    await db.commit()
    return {"id": server.id, "message": "created"}


@router.put("/mcp/servers/{server_id}")
async def update_mcp_server(
    server_id: int,
    data: MCPServerUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    update_data = data.model_dump(exclude_unset=True)
    if "transport" in update_data:
        transport = str(update_data["transport"]).strip().lower()
        if transport not in {"remote", "stdio"}:
            raise HTTPException(status_code=400, detail="transport must be remote or stdio")
        update_data["transport"] = transport

    target_transport = str(update_data.get("transport") or "").strip().lower()
    if not target_transport:
        current = await crud.get_mcp_server_by_id(db, server_id)
        if not current:
            raise HTTPException(status_code=404, detail="MCP server not found")
        target_transport = current.transport

    if "base_url" in update_data and update_data.get("base_url"):
        update_data["base_url"] = _validate_http_url(str(update_data["base_url"]))
    elif target_transport == "remote" and "transport" in update_data and not update_data.get("base_url"):
        # 切换到 remote 时，保留旧值或报错
        current = await crud.get_mcp_server_by_id(db, server_id)
        if not current or not current.base_url:
            raise HTTPException(status_code=400, detail="base_url is required for remote transport")
    if target_transport == "stdio" and "transport" in update_data and not update_data.get("command"):
        current = await crud.get_mcp_server_by_id(db, server_id)
        if not current or not current.command:
            raise HTTPException(status_code=400, detail="command is required for stdio transport")

    if "args_json" in update_data:
        update_data["args_json"] = _normalize_json_input(field_name="args_json", raw=update_data.get("args_json"), expected="array")
    if "env_json" in update_data:
        update_data["env_json"] = _normalize_json_input(field_name="env_json", raw=update_data.get("env_json"), expected="object")
    if "headers_json" in update_data:
        update_data["headers_json"] = _normalize_json_input(field_name="headers_json", raw=update_data.get("headers_json"), expected="object")

    server = await mcp_service.update_server(db, server_id, **update_data)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    await db.commit()
    return {"message": "updated"}


@router.delete("/mcp/servers/{server_id}")
async def delete_mcp_server(
    server_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    success = await crud.delete_mcp_server(db, server_id)
    await db.commit()
    if not success:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return {"message": "deleted"}


@router.post("/mcp/servers/{server_id}/test")
async def test_mcp_server(
    server_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    try:
        return await mcp_service.test_server(db, server_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"MCP server test failed: {exc}")


@router.post("/mcp/servers/{server_id}/refresh-tools")
async def refresh_mcp_server_tools(
    server_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    try:
        tools = await mcp_service.refresh_server_tools(db, server_id)
        await db.commit()
        return {"count": len(tools), "tools": tools}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"refresh tools failed: {exc}")


@router.get("/mcp/servers/{server_id}/tools")
async def get_mcp_server_tools(
    server_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    return await mcp_service.list_server_tools(db, server_id)


@router.put("/mcp/servers/{server_id}/tools/{tool_name}")
async def update_mcp_tool_flags(
    server_id: int,
    tool_name: str,
    data: MCPToolFlagUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    updated = await mcp_service.update_tool_flags(
        db,
        server_id,
        tool_name,
        is_enabled=data.is_enabled,
        requires_approval=data.requires_approval,
    )
    await db.commit()
    if not updated:
        raise HTTPException(status_code=404, detail="MCP tool not found")
    return {"message": "updated"}


@router.get("/mcp/servers/{server_id}/resources")
async def get_mcp_server_resources(
    server_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    try:
        return await mcp_service.list_server_resources(db, server_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"list resources failed: {exc}")


@router.post("/mcp/servers/{server_id}/resources/read")
async def read_mcp_server_resource(
    server_id: int,
    data: MCPResourceReadRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    try:
        return await mcp_service.read_server_resource(db, server_id, data.uri.strip())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"read resource failed: {exc}")


@router.get("/mcp/servers/{server_id}/prompts")
async def get_mcp_server_prompts(
    server_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    try:
        return await mcp_service.list_server_prompts(db, server_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"list prompts failed: {exc}")


@router.post("/mcp/servers/{server_id}/prompts/get")
async def get_mcp_server_prompt(
    server_id: int,
    data: MCPPromptGetRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    try:
        return await mcp_service.get_server_prompt(
            db,
            server_id,
            data.name.strip(),
            data.arguments if isinstance(data.arguments, dict) else {},
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"get prompt failed: {exc}")


@router.get("/mcp/runs")
async def get_mcp_run_logs(
    request_id: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    return await mcp_service.get_run_logs(
        db,
        user_id=user_id,
        request_id=request_id,
        page=page,
        page_size=page_size,
    )
