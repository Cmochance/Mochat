"""
CORS 配置验证模块

在应用启动时验证 CORS 配置的正确性和安全性:
- 验证 URL 格式
- 检测通配符使用
- 检测 HTTP 在生产环境中的使用
"""

import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)


def validate_cors_origins(origins: List[str], is_debug: bool = True) -> Tuple[List[str], List[str]]:
    """
    验证 CORS 来源列表

    参数:
        origins: 待验证的来源列表
        is_debug: 是否为调试模式

    返回:
        (valid_origins, warnings)
    """
    valid_origins = []
    warnings = []

    for origin in origins:
        origin = origin.strip()

        if not origin:
            continue

        # 检测通配符（极度危险）
        if origin == "*":
            warnings.append(
                "CORS 配置包含通配符 '*'，任何网站都可以向此 API 发起请求。"
                "仅适用于公开 API 或本地开发，绝不应在生产环境中使用。"
            )
            valid_origins.append(origin)
            continue

        # 验证 URL 格式
        if not origin.startswith(("http://", "https://")):
            warnings.append(f"CORS 来源格式无效: '{origin}'。必须以 http:// 或 https:// 开头。")
            continue

        # 检测 HTTP 在非调试环境中的使用
        if origin.startswith("http://") and not is_debug:
            warnings.append(f"CORS 来源使用不安全的 HTTP 协议: '{origin}'。生产环境建议使用 HTTPS。")

        # 检测 localhost 在非调试环境中的使用
        if "localhost" in origin and not is_debug:
            warnings.append(f"CORS 来源包含 localhost: '{origin}'。生产环境不应允许 localhost 来源。")

        valid_origins.append(origin)

    if not valid_origins:
        warnings.append("CORS 配置中没有有效的来源。API 可能无法被前端正常访问。")

    return valid_origins, warnings
