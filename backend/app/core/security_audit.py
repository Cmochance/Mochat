"""
安全审计日志模块

提供结构化的安全日志记录:
- 认证事件（登录成功/失败、注册、密码重置）
- Token 事件（刷新、过期、无效）
- 速率限制事件
- 可疑输入事件

所有安全日志统一使用结构化格式，便于日志分析平台检索。
"""

import logging
from datetime import UTC, datetime
from typing import Any, Optional

logger = logging.getLogger("security_audit")


def _now_iso() -> str:
    """返回 ISO 8601 格式的当前 UTC 时间"""
    return datetime.now(UTC).isoformat()


def _log_event(
    event_type: str,
    level: str,
    message: str,
    user_id: Optional[int] = None,
    ip: Optional[str] = None,
    **extra: Any,
) -> None:
    """
    记录一条结构化安全事件

    参数:
        event_type: 事件类型（如 auth.login_success）
        level: 日志级别（info / warning / error）
        message: 人类可读的事件描述
        user_id: 关联的用户 ID（如有）
        ip: 客户端 IP 地址（如有）
    """
    event = {
        "timestamp": _now_iso(),
        "event_type": event_type,
        "message": message,
        "user_id": user_id,
        "ip": ip,
        **extra,
    }

    log_fn = getattr(logger, level, logger.info)
    log_fn("security_event: %s", event_type, extra={"security_event": event})


def _mask_identifier(identifier: str) -> str:
    """
    对用户标识（用户名/邮箱）做部分脱敏
    例: alice@example.com -> a***e@example.com
    """
    if not identifier:
        return "***"

    if "@" in identifier:
        local, domain = identifier.rsplit("@", 1)
        if len(local) <= 2:
            masked_local = local[0] + "***"
        else:
            masked_local = local[0] + "***" + local[-1]
        return f"{masked_local}@{domain}"
    else:
        if len(identifier) <= 2:
            return identifier[0] + "***"
        return identifier[0] + "***" + identifier[-1]


# ============ 认证事件 ============

def log_login_success(user_id: int, ip: Optional[str] = None, auth_provider: str = "legacy") -> None:
    """记录登录成功事件"""
    _log_event(
        event_type="auth.login_success",
        level="info",
        message=f"用户登录成功: user_id={user_id}",
        user_id=user_id,
        ip=ip,
        auth_provider=auth_provider,
    )


def log_login_failure(identifier: str, ip: Optional[str] = None, reason: str = "") -> None:
    """记录登录失败事件（不记录密码）"""
    masked = _mask_identifier(identifier)
    _log_event(
        event_type="auth.login_failure",
        level="warning",
        message=f"登录失败: identifier={masked}, reason={reason}",
        ip=ip,
        identifier_masked=masked,
        reason=reason,
    )


def log_register_success(user_id: int, ip: Optional[str] = None) -> None:
    """记录注册成功事件"""
    _log_event(
        event_type="auth.register_success",
        level="info",
        message=f"新用户注册: user_id={user_id}",
        user_id=user_id,
        ip=ip,
    )


def log_password_change(user_id: int, ip: Optional[str] = None) -> None:
    """记录密码修改事件"""
    _log_event(
        event_type="auth.password_change",
        level="info",
        message=f"用户修改密码: user_id={user_id}",
        user_id=user_id,
        ip=ip,
    )


def log_password_reset(email: str, ip: Optional[str] = None) -> None:
    """记录密码重置事件"""
    masked = _mask_identifier(email)
    _log_event(
        event_type="auth.password_reset",
        level="info",
        message=f"密码重置: email={masked}",
        ip=ip,
        identifier_masked=masked,
    )


# ============ Token 事件 ============

def log_token_refresh_success(user_id: int, ip: Optional[str] = None, source: str = "cookie") -> None:
    """记录 token 刷新成功事件"""
    _log_event(
        event_type="token.refresh_success",
        level="info",
        message=f"Token 刷新成功: user_id={user_id}, source={source}",
        user_id=user_id,
        ip=ip,
        source=source,
    )


def log_token_refresh_failure(ip: Optional[str] = None, reason: str = "") -> None:
    """记录 token 刷新失败事件"""
    _log_event(
        event_type="token.refresh_failure",
        level="warning",
        message=f"Token 刷新失败: reason={reason}",
        ip=ip,
        reason=reason,
    )


def log_token_invalid(ip: Optional[str] = None, token_type: str = "access") -> None:
    """记录无效 token 事件"""
    _log_event(
        event_type="token.invalid",
        level="warning",
        message=f"无效 {token_type} token 被使用",
        ip=ip,
        token_type=token_type,
    )


# ============ 权限事件 ============

def log_permission_denied(user_id: Optional[int], ip: Optional[str] = None, resource: str = "") -> None:
    """记录权限拒绝事件"""
    _log_event(
        event_type="permission.denied",
        level="warning",
        message=f"权限不足: user_id={user_id}, resource={resource}",
        user_id=user_id,
        ip=ip,
        resource=resource,
    )


def log_account_disabled(user_id: int, ip: Optional[str] = None) -> None:
    """记录禁用账号尝试登录事件"""
    _log_event(
        event_type="auth.account_disabled",
        level="warning",
        message=f"禁用账号尝试登录: user_id={user_id}",
        user_id=user_id,
        ip=ip,
    )


# ============ 速率限制事件 ============

def log_rate_limit_hit(ip: str, endpoint: str = "", limit: str = "") -> None:
    """记录速率限制触发事件"""
    _log_event(
        event_type="rate_limit.hit",
        level="warning",
        message=f"速率限制触发: ip={ip}, endpoint={endpoint}",
        ip=ip,
        endpoint=endpoint,
        limit=limit,
    )


def log_ip_blocked(ip: str, duration_seconds: int = 300) -> None:
    """记录 IP 被阻止事件"""
    _log_event(
        event_type="rate_limit.ip_blocked",
        level="warning",
        message=f"IP 被阻止: ip={ip}, duration={duration_seconds}s",
        ip=ip,
        duration_seconds=duration_seconds,
    )


# ============ 可疑输入事件 ============

def log_suspicious_input(ip: Optional[str], field: str = "", attack_type: str = "") -> None:
    """记录可疑输入事件"""
    _log_event(
        event_type="input.suspicious",
        level="warning",
        message=f"可疑输入检测: field={field}, type={attack_type}",
        ip=ip,
        field=field,
        attack_type=attack_type,
    )
