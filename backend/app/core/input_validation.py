"""
输入验证和净化模块 - 防止 XSS、注入等攻击

提供统一的输入验证和净化工具函数:
- HTML 标签剥离
- SQL 注射检测（辅助，主防线为 SQLAlchemy 参数化查询）
- 路径遍历检测
- 通用字符串净化
"""

import html
import logging
import re
from typing import Optional

from .security_audit import log_suspicious_input

logger = logging.getLogger(__name__)

# 常见 SQL 注入模式（用于检测，不是万能方案）
_SQL_INJECTION_PATTERNS = [
    r"(?:union\s+select|select\s+.+\s+from|insert\s+into|delete\s+from|"
    r"drop\s+table|alter\s+table|exec\s*\(|execute\s*\(|"
    r"xp_cmdshell|sp_executesql|information_schema)",
    r"(?:--\s*$|/\*.*\*/)",
    r"(?:\b(?:or|and)\s+\d+\s*=\s*\d+)",
    r"(?:;\s*(?:drop|delete|update|insert|alter|exec))",
]

_SQL_INJECTION_REGEX = re.compile(
    "|".join(_SQL_INJECTION_PATTERNS), re.IGNORECASE
)

# 路径遍历模式
_PATH_TRAVERSAL_REGEX = re.compile(r"\.\./|\.\.\\|%2e%2e%2f|%2e%2e/|\.\.%2f")


def sanitize_html(text: str) -> str:
    """
    净化 HTML 内容，转义所有 HTML 特殊字符
    用于需要纯文本显示的场景，防止 XSS 注入。
    """
    if not text:
        return text
    return html.escape(text, quote=True)


def strip_html_tags(text: str) -> str:
    """剥离所有 HTML 标签，返回纯文本"""
    if not text:
        return text
    clean = re.sub(r"<[^>]+>", "", text)
    return clean.strip()


def detect_sql_injection(text: str) -> bool:
    """
    检测文本是否可能包含 SQL 注入攻击
    注意: 主要安全防线由参数化查询（SQLAlchemy ORM）提供，此为辅助检测。
    """
    if not text:
        return False
    return bool(_SQL_INJECTION_REGEX.search(text))


def detect_path_traversal(text: str) -> bool:
    """检测文本是否包含路径遍历攻击"""
    if not text:
        return False
    return bool(_PATH_TRAVERSAL_REGEX.search(text))


def sanitize_filename(filename: str) -> str:
    """
    净化文件名，移除路径遍历和危险字符
    仅保留: 字母、数字、中文、下划线、连字符、点号
    """
    if not filename:
        return "untitled"
    clean = re.sub(r"[/\\]", "", filename)
    clean = clean.replace("..", "")
    clean = re.sub(r"[^\w\u4e00-\u9fff.\-]", "_", clean)
    if len(clean) > 200:
        clean = clean[:200]
    return clean or "untitled"


def validate_and_sanitize_string(
    value: str,
    field_name: str = "field",
    min_length: int = 0,
    max_length: int = 10000,
    allow_html: bool = False,
) -> tuple[str, Optional[str]]:
    """
    通用字符串验证和净化

    参数:
        value: 待验证的字符串
        field_name: 字段名（用于错误消息）
        min_length: 最小长度
        max_length: 最大长度
        allow_html: 是否允许 HTML 标签

    返回:
        (sanitized_value, error_message)
        如果验证通过，error_message 为 None
    """
    if not isinstance(value, str):
        return "", f"{field_name} 必须是字符串"

    sanitized = value.strip()

    if len(sanitized) < min_length:
        return sanitized, f"{field_name} 长度不能少于 {min_length} 个字符"
    if len(sanitized) > max_length:
        return sanitized, f"{field_name} 长度不能超过 {max_length} 个字符"

    if not allow_html:
        sanitized = strip_html_tags(sanitized)

    if detect_sql_injection(sanitized):
        log_suspicious_input(ip=None, field=field_name, attack_type="sql_injection")

    return sanitized, None
