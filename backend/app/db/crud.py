"""
CRUD操作封装
"""
import json
from datetime import datetime
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload

from .models import (
    User,
    ChatSession,
    Message,
    SystemConfig,
    RestrictedKeyword,
    AllowedModel,
    MCPServer,
    MCPServerSecret,
    MCPUserConnection,
    MCPToolCache,
    MCPRunLog,
    MCPApproval,
)
from ..core.config import settings
from ..core.security import get_password_hash, verify_password, encrypt_password


# ============ 用户相关 CRUD ============

async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    """根据ID获取用户"""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    """根据用户名获取用户"""
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """根据邮箱获取用户"""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_supabase_auth_id(db: AsyncSession, supabase_auth_id: str) -> Optional[User]:
    """根据 Supabase Auth ID 获取用户"""
    result = await db.execute(select(User).where(User.supabase_auth_id == supabase_auth_id))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession, 
    username: str, 
    email: str, 
    password: str,
    role: str = "user",
    supabase_auth_id: Optional[str] = None,
) -> User:
    """创建新用户"""
    user = User(
        username=username,
        email=email,
        supabase_auth_id=supabase_auth_id,
        password_hash=get_password_hash(password),
        # Supabase Auth 模式下不再存储可逆加密密码（避免重复存储敏感信息）
        password_encrypted=encrypt_password(password) if settings.AUTH_PROVIDER == "legacy" else None,
        role=role
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def authenticate_user(
    db: AsyncSession, 
    username: str, 
    password: str
) -> Optional[User]:
    """验证用户登录"""
    user = await get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def get_all_users(
    db: AsyncSession, 
    skip: int = 0, 
    limit: int = 100
) -> List[User]:
    """获取所有用户"""
    result = await db.execute(
        select(User).offset(skip).limit(limit).order_by(User.created_at.desc())
    )
    return result.scalars().all()


async def update_user(
    db: AsyncSession,
    user_id: int,
    **kwargs
) -> Optional[User]:
    """更新用户信息"""
    await db.execute(
        update(User).where(User.id == user_id).values(**kwargs)
    )
    await db.flush()
    return await get_user_by_id(db, user_id)


async def delete_user(db: AsyncSession, user_id: int) -> bool:
    """删除用户"""
    result = await db.execute(delete(User).where(User.id == user_id))
    return result.rowcount > 0


async def get_user_count(db: AsyncSession) -> int:
    """获取用户总数"""
    result = await db.execute(select(func.count(User.id)))
    return result.scalar()


# ============ 会话相关 CRUD ============

async def create_session(
    db: AsyncSession, 
    user_id: int, 
    title: str = "新对话"
) -> ChatSession:
    """创建新会话"""
    session = ChatSession(user_id=user_id, title=title)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def get_session_by_id(
    db: AsyncSession, 
    session_id: int
) -> Optional[ChatSession]:
    """根据ID获取会话"""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def get_user_sessions(
    db: AsyncSession, 
    user_id: int,
    skip: int = 0,
    limit: int = 50
) -> List[ChatSession]:
    """获取用户的所有会话"""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


async def update_session(
    db: AsyncSession,
    session_id: int,
    **kwargs
) -> Optional[ChatSession]:
    """更新会话"""
    await db.execute(
        update(ChatSession).where(ChatSession.id == session_id).values(**kwargs)
    )
    await db.flush()
    return await get_session_by_id(db, session_id)


async def delete_session(db: AsyncSession, session_id: int) -> bool:
    """删除会话"""
    result = await db.execute(delete(ChatSession).where(ChatSession.id == session_id))
    return result.rowcount > 0


async def get_session_count(db: AsyncSession) -> int:
    """获取会话总数"""
    result = await db.execute(select(func.count(ChatSession.id)))
    return result.scalar()


# ============ 消息相关 CRUD ============

async def create_message(
    db: AsyncSession,
    session_id: int,
    role: str,
    content: str,
    thinking: Optional[str] = None
) -> Message:
    """创建新消息"""
    message = Message(
        session_id=session_id,
        role=role,
        content=content,
        thinking=thinking
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)
    return message


async def get_session_messages(
    db: AsyncSession,
    session_id: int,
    limit: int = 100
) -> List[Message]:
    """获取会话的所有消息"""
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    return result.scalars().all()


async def get_session_messages_paginated(
    db: AsyncSession,
    session_id: int,
    limit: int = 10,
    before_id: Optional[int] = None
) -> tuple[List[Message], bool]:
    """
    分页获取会话消息（从新到旧）
    
    Args:
        session_id: 会话 ID
        limit: 获取数量
        before_id: 获取此 ID 之前的消息（用于加载更早的消息）
    
    Returns:
        (消息列表, 是否还有更多消息)
    """
    query = select(Message).where(Message.session_id == session_id)
    
    if before_id:
        query = query.where(Message.id < before_id)
    
    # 按时间倒序获取，这样能拿到最新的 N 条
    query = query.order_by(Message.id.desc()).limit(limit + 1)
    
    result = await db.execute(query)
    messages = list(result.scalars().all())
    
    # 判断是否还有更多消息
    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]
    
    # 反转为正序（从旧到新）
    messages.reverse()
    
    return messages, has_more


async def get_session_message_count(
    db: AsyncSession,
    session_id: int
) -> int:
    """获取会话消息总数"""
    result = await db.execute(
        select(func.count(Message.id)).where(Message.session_id == session_id)
    )
    return result.scalar() or 0


async def get_message_count(db: AsyncSession) -> int:
    """获取消息总数"""
    result = await db.execute(select(func.count(Message.id)))
    return result.scalar()


# ============ 配置相关 CRUD ============

async def get_config(db: AsyncSession, key: str) -> Optional[str]:
    """获取配置值"""
    result = await db.execute(
        select(SystemConfig.value).where(SystemConfig.key == key)
    )
    return result.scalar_one_or_none()


async def set_config(db: AsyncSession, key: str, value: str) -> SystemConfig:
    """设置配置值"""
    existing = await db.execute(
        select(SystemConfig).where(SystemConfig.key == key)
    )
    config = existing.scalar_one_or_none()
    
    if config:
        config.value = value
    else:
        config = SystemConfig(key=key, value=value)
        db.add(config)
    
    await db.flush()
    await db.refresh(config)
    return config


# ============ 限制词相关 CRUD ============

async def get_all_keywords(
    db: AsyncSession,
    active_only: bool = False
) -> List[RestrictedKeyword]:
    """获取所有限制词"""
    query = select(RestrictedKeyword).order_by(RestrictedKeyword.created_at.desc())
    if active_only:
        query = query.where(RestrictedKeyword.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


async def get_active_keywords(db: AsyncSession) -> List[str]:
    """获取所有启用的限制词（仅返回关键词字符串列表）"""
    result = await db.execute(
        select(RestrictedKeyword.keyword)
        .where(RestrictedKeyword.is_active == True)
    )
    return [row[0] for row in result.fetchall()]


async def add_keyword(
    db: AsyncSession,
    keyword: str,
    created_by: Optional[int] = None
) -> Optional[RestrictedKeyword]:
    """添加限制词"""
    # 检查是否已存在
    existing = await db.execute(
        select(RestrictedKeyword).where(RestrictedKeyword.keyword == keyword)
    )
    if existing.scalar_one_or_none():
        return None  # 已存在
    
    new_keyword = RestrictedKeyword(
        keyword=keyword,
        created_by=created_by
    )
    db.add(new_keyword)
    await db.flush()
    await db.refresh(new_keyword)
    return new_keyword


async def delete_keyword(db: AsyncSession, keyword_id: int) -> bool:
    """删除限制词"""
    result = await db.execute(
        delete(RestrictedKeyword).where(RestrictedKeyword.id == keyword_id)
    )
    return result.rowcount > 0


async def toggle_keyword_status(
    db: AsyncSession,
    keyword_id: int
) -> Optional[RestrictedKeyword]:
    """切换限制词状态"""
    result = await db.execute(
        select(RestrictedKeyword).where(RestrictedKeyword.id == keyword_id)
    )
    keyword = result.scalar_one_or_none()
    if keyword:
        keyword.is_active = not keyword.is_active
        await db.flush()
        await db.refresh(keyword)
    return keyword


async def get_keyword_count(db: AsyncSession) -> int:
    """获取限制词总数"""
    result = await db.execute(select(func.count(RestrictedKeyword.id)))
    return result.scalar()


# ============ 模型管理相关 CRUD ============

async def get_all_allowed_models(
    db: AsyncSession,
    active_only: bool = False
) -> List[AllowedModel]:
    """获取所有允许的模型"""
    query = select(AllowedModel).order_by(AllowedModel.sort_order.asc(), AllowedModel.created_at.asc())
    if active_only:
        query = query.where(AllowedModel.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


async def get_active_model_ids(db: AsyncSession) -> List[str]:
    """获取所有启用的模型 ID 列表"""
    result = await db.execute(
        select(AllowedModel.model_id)
        .where(AllowedModel.is_active == True)
        .order_by(AllowedModel.sort_order.asc())
    )
    return [row[0] for row in result.fetchall()]


async def add_allowed_model(
    db: AsyncSession,
    model_id: str,
    display_name: Optional[str] = None,
    sort_order: int = 0
) -> Optional[AllowedModel]:
    """添加允许的模型"""
    # 检查是否已存在
    existing = await db.execute(
        select(AllowedModel).where(AllowedModel.model_id == model_id)
    )
    if existing.scalar_one_or_none():
        return None  # 已存在
    
    new_model = AllowedModel(
        model_id=model_id,
        display_name=display_name,
        sort_order=sort_order
    )
    db.add(new_model)
    await db.flush()
    await db.refresh(new_model)
    return new_model


async def delete_allowed_model(db: AsyncSession, model_db_id: int) -> bool:
    """删除允许的模型"""
    result = await db.execute(
        delete(AllowedModel).where(AllowedModel.id == model_db_id)
    )
    return result.rowcount > 0


async def toggle_model_status(
    db: AsyncSession,
    model_db_id: int
) -> Optional[AllowedModel]:
    """切换模型启用状态"""
    result = await db.execute(
        select(AllowedModel).where(AllowedModel.id == model_db_id)
    )
    model = result.scalar_one_or_none()
    if model:
        model.is_active = not model.is_active
        await db.flush()
        await db.refresh(model)
    return model


async def update_model_sort_order(
    db: AsyncSession,
    model_db_id: int,
    sort_order: int
) -> Optional[AllowedModel]:
    """更新模型排序顺序"""
    result = await db.execute(
        select(AllowedModel).where(AllowedModel.id == model_db_id)
    )
    model = result.scalar_one_or_none()
    if model:
        model.sort_order = sort_order
        await db.flush()
        await db.refresh(model)
    return model


async def get_allowed_model_count(db: AsyncSession) -> int:
    """获取允许的模型总数"""
    result = await db.execute(select(func.count(AllowedModel.id)))
    return result.scalar()


# ============ MCP 管理相关 CRUD ============

async def get_mcp_server_by_id(db: AsyncSession, server_id: int) -> Optional[MCPServer]:
    result = await db.execute(select(MCPServer).where(MCPServer.id == server_id))
    return result.scalar_one_or_none()


async def get_mcp_servers(db: AsyncSession, active_only: bool = False) -> List[MCPServer]:
    query = select(MCPServer).order_by(MCPServer.created_at.asc())
    if active_only:
        query = query.where(MCPServer.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


async def create_mcp_server(
    db: AsyncSession,
    name: str,
    transport: str,
    is_active: bool = True,
    base_url: Optional[str] = None,
    command: Optional[str] = None,
    args_json: Optional[str] = None,
    env_json: Optional[str] = None,
    headers_json: Optional[str] = None,
    timeout_ms: int = 15000,
    retry_count: int = 1,
) -> Optional[MCPServer]:
    existing = await db.execute(select(MCPServer).where(MCPServer.name == name))
    if existing.scalar_one_or_none():
        return None

    server = MCPServer(
        name=name,
        transport=transport,
        is_active=is_active,
        base_url=base_url,
        command=command,
        args_json=args_json,
        env_json=env_json,
        headers_json=headers_json,
        timeout_ms=timeout_ms,
        retry_count=retry_count,
    )
    db.add(server)
    await db.flush()
    await db.refresh(server)
    return server


async def update_mcp_server(
    db: AsyncSession,
    server_id: int,
    **kwargs,
) -> Optional[MCPServer]:
    server = await get_mcp_server_by_id(db, server_id)
    if not server:
        return None
    for key, value in kwargs.items():
        if hasattr(server, key) and value is not None:
            setattr(server, key, value)
    await db.flush()
    await db.refresh(server)
    return server


async def delete_mcp_server(db: AsyncSession, server_id: int) -> bool:
    await db.execute(delete(MCPToolCache).where(MCPToolCache.server_id == server_id))
    await db.execute(delete(MCPServerSecret).where(MCPServerSecret.server_id == server_id))
    result = await db.execute(delete(MCPServer).where(MCPServer.id == server_id))
    return result.rowcount > 0


async def get_mcp_server_secret(db: AsyncSession, server_id: int) -> Optional[MCPServerSecret]:
    result = await db.execute(select(MCPServerSecret).where(MCPServerSecret.server_id == server_id))
    return result.scalar_one_or_none()


async def set_mcp_server_secret(
    db: AsyncSession,
    server_id: int,
    secret_ciphertext: str,
    key_version: str = "v1",
) -> MCPServerSecret:
    secret = await get_mcp_server_secret(db, server_id)
    if secret:
        secret.secret_ciphertext = secret_ciphertext
        secret.key_version = key_version
        secret.updated_at = datetime.utcnow()
    else:
        secret = MCPServerSecret(
            server_id=server_id,
            secret_ciphertext=secret_ciphertext,
            key_version=key_version,
        )
        db.add(secret)
    await db.flush()
    await db.refresh(secret)
    return secret


async def delete_mcp_server_secret(db: AsyncSession, server_id: int) -> bool:
    result = await db.execute(delete(MCPServerSecret).where(MCPServerSecret.server_id == server_id))
    return result.rowcount > 0


async def get_mcp_tools(db: AsyncSession, server_id: int, enabled_only: bool = False) -> List[MCPToolCache]:
    query = select(MCPToolCache).where(MCPToolCache.server_id == server_id).order_by(MCPToolCache.tool_name.asc())
    if enabled_only:
        query = query.where(MCPToolCache.is_enabled == True)
    result = await db.execute(query)
    return result.scalars().all()


async def get_mcp_tool(db: AsyncSession, server_id: int, tool_name: str) -> Optional[MCPToolCache]:
    result = await db.execute(
        select(MCPToolCache).where(
            MCPToolCache.server_id == server_id,
            MCPToolCache.tool_name == tool_name,
        )
    )
    return result.scalar_one_or_none()


async def upsert_mcp_tool_cache(
    db: AsyncSession,
    server_id: int,
    tool_name: str,
    description: Optional[str],
    input_schema_json: Optional[str],
) -> MCPToolCache:
    result = await db.execute(
        select(MCPToolCache).where(
            MCPToolCache.server_id == server_id,
            MCPToolCache.tool_name == tool_name,
        )
    )
    tool = result.scalar_one_or_none()
    if tool:
        tool.description = description
        tool.input_schema_json = input_schema_json
    else:
        tool = MCPToolCache(
            server_id=server_id,
            tool_name=tool_name,
            description=description,
            input_schema_json=input_schema_json,
            is_enabled=True,
            requires_approval=False,
        )
        db.add(tool)
    await db.flush()
    await db.refresh(tool)
    return tool


async def delete_mcp_tools_not_in(db: AsyncSession, server_id: int, tool_names: List[str]) -> int:
    if tool_names:
        result = await db.execute(
            delete(MCPToolCache).where(
                MCPToolCache.server_id == server_id,
                MCPToolCache.tool_name.notin_(tool_names),
            )
        )
    else:
        result = await db.execute(delete(MCPToolCache).where(MCPToolCache.server_id == server_id))
    return result.rowcount or 0


async def update_mcp_tool_flags(
    db: AsyncSession,
    server_id: int,
    tool_name: str,
    is_enabled: Optional[bool] = None,
    requires_approval: Optional[bool] = None,
) -> Optional[MCPToolCache]:
    result = await db.execute(
        select(MCPToolCache).where(
            MCPToolCache.server_id == server_id,
            MCPToolCache.tool_name == tool_name,
        )
    )
    tool = result.scalar_one_or_none()
    if not tool:
        return None
    if is_enabled is not None:
        tool.is_enabled = is_enabled
    if requires_approval is not None:
        tool.requires_approval = requires_approval
    await db.flush()
    await db.refresh(tool)
    return tool


async def create_mcp_run_log(
    db: AsyncSession,
    request_id: str,
    user_id: int,
    step_type: str,
    session_id: Optional[int] = None,
    server_id: Optional[int] = None,
    tool_name: Optional[str] = None,
    input_data: Optional[dict] = None,
    output_data: Optional[dict] = None,
    status: str = "success",
    error_code: Optional[str] = None,
    latency_ms: Optional[int] = None,
) -> MCPRunLog:
    log = MCPRunLog(
        request_id=request_id,
        session_id=session_id,
        user_id=user_id,
        step_type=step_type,
        server_id=server_id,
        tool_name=tool_name,
        input_json=json.dumps(input_data, ensure_ascii=False) if input_data is not None else None,
        output_json=json.dumps(output_data, ensure_ascii=False) if output_data is not None else None,
        status=status,
        error_code=error_code,
        latency_ms=latency_ms,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)
    return log


async def get_mcp_run_logs(
    db: AsyncSession,
    user_id: Optional[int] = None,
    request_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[int, List[MCPRunLog]]:
    query = select(MCPRunLog)
    count_query = select(func.count(MCPRunLog.id))

    if user_id is not None:
        query = query.where(MCPRunLog.user_id == user_id)
        count_query = count_query.where(MCPRunLog.user_id == user_id)
    if request_id:
        query = query.where(MCPRunLog.request_id == request_id)
        count_query = count_query.where(MCPRunLog.request_id == request_id)

    query = query.order_by(MCPRunLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    total = (await db.execute(count_query)).scalar() or 0
    items = (await db.execute(query)).scalars().all()
    return total, items


async def get_mcp_run_logs_by_request(db: AsyncSession, request_id: str) -> List[MCPRunLog]:
    query = (
        select(MCPRunLog)
        .where(MCPRunLog.request_id == request_id)
        .order_by(MCPRunLog.created_at.asc(), MCPRunLog.id.asc())
    )
    return (await db.execute(query)).scalars().all()


async def create_mcp_approval(
    db: AsyncSession,
    request_id: str,
    session_id: int,
    user_id: int,
    tool_name: str,
    input_data: dict,
    expired_at: Optional[datetime] = None,
) -> MCPApproval:
    approval = MCPApproval(
        request_id=request_id,
        session_id=session_id,
        user_id=user_id,
        tool_name=tool_name,
        input_json=json.dumps(input_data, ensure_ascii=False),
        status="pending",
        expired_at=expired_at,
    )
    db.add(approval)
    await db.flush()
    await db.refresh(approval)
    return approval


async def get_mcp_approval_by_id(db: AsyncSession, approval_id: int) -> Optional[MCPApproval]:
    result = await db.execute(select(MCPApproval).where(MCPApproval.id == approval_id))
    return result.scalar_one_or_none()


async def update_mcp_approval_status(
    db: AsyncSession,
    approval_id: int,
    status: str,
    approved_by: Optional[int] = None,
) -> Optional[MCPApproval]:
    approval = await get_mcp_approval_by_id(db, approval_id)
    if not approval:
        return None
    approval.status = status
    if status in {"approved", "rejected", "expired"}:
        approval.approved_at = datetime.utcnow()
    if approved_by is not None:
        approval.approved_by = approved_by
    await db.flush()
    await db.refresh(approval)
    return approval


async def get_mcp_user_connection(
    db: AsyncSession,
    user_id: int,
    server_id: int,
) -> Optional[MCPUserConnection]:
    result = await db.execute(
        select(MCPUserConnection).where(
            MCPUserConnection.user_id == user_id,
            MCPUserConnection.server_id == server_id,
        )
    )
    return result.scalar_one_or_none()


async def set_mcp_user_connection_secret(
    db: AsyncSession,
    *,
    user_id: int,
    server_id: int,
    secret_ciphertext: str,
    auth_type: str = "bearer",
) -> MCPUserConnection:
    record = await get_mcp_user_connection(db, user_id, server_id)
    if record:
        record.secret_ciphertext = secret_ciphertext
        record.auth_type = auth_type
        record.updated_at = datetime.utcnow()
    else:
        record = MCPUserConnection(
            user_id=user_id,
            server_id=server_id,
            auth_type=auth_type,
            secret_ciphertext=secret_ciphertext,
        )
        db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


async def delete_mcp_user_connection(db: AsyncSession, user_id: int, server_id: int) -> bool:
    result = await db.execute(
        delete(MCPUserConnection).where(
            MCPUserConnection.user_id == user_id,
            MCPUserConnection.server_id == server_id,
        )
    )
    return result.rowcount > 0


async def list_mcp_user_connections(db: AsyncSession, user_id: int) -> List[MCPUserConnection]:
    result = await db.execute(
        select(MCPUserConnection)
        .where(MCPUserConnection.user_id == user_id)
        .order_by(MCPUserConnection.updated_at.desc())
    )
    return result.scalars().all()
