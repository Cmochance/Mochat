"""
速率限制模块 - 防止认证端点暴力破解

仅用于认证类敏感端点（登录/注册/密码重置等）。
使用进程内存计数器，单实例部署有效；
多实例部署需将 IPRateLimiter 的存储后端替换为 Redis。
"""

import logging
import time
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, Request, status

from .security_audit import log_ip_blocked, log_rate_limit_hit

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """
    提取客户端 IP 地址

    生产环境应在反向代理（nginx/cloudflare）后面运行 uvicorn --proxy-headers，
    此时 request.client.host 已是真实客户端 IP，无需在此手动解析 X-Forwarded-For。
    不在此处信任 X-Forwarded-For，以防直接暴露时被伪造绕过限流。
    """
    return request.client.host if request.client else "unknown"


# 认证端点限流规则：{端点名: (最大请求数, 时间窗口秒)}
AUTH_RATE_LIMITS: dict[str, tuple[int, int]] = {
    "register": (5, 3600),  # 5次/小时
    "login": (10, 60),  # 10次/分钟
    "refresh": (20, 60),  # 20次/分钟
    "reset_password": (3, 3600),  # 3次/小时
    "verify_send": (10, 60),  # 10次/分钟
}

_DEFAULT_AUTH_LIMIT: tuple[int, int] = (20, 60)  # 默认 20次/分钟


class IPRateLimiter:
    """
    IP 级别的速率限制器，用于防止暴力破解

    维护两个结构:
    - ip_requests: {ip: [(timestamp, endpoint), ...]} 滑动窗口
    - blocked_ips: {ip: unblock_timestamp} 临时封禁
    """

    def __init__(self):
        self.ip_requests: dict[str, list[tuple[float, str]]] = defaultdict(list)
        self.blocked_ips: dict[str, float] = {}

    def check_rate_limit(
        self, ip: str, endpoint: str, max_requests: int, time_window: int
    ) -> tuple[bool, Optional[int]]:
        """
        检查 IP 的速率限制

        返回:
            (allowed, retry_after): 是否允许；不允许时返回需等待秒数
        """
        current_time = time.time()

        # 检查 IP 是否处于封禁期
        if ip in self.blocked_ips:
            if current_time < self.blocked_ips[ip]:
                return False, int(self.blocked_ips[ip] - current_time)
            del self.blocked_ips[ip]

        # 清理过期记录（滑动窗口）
        self.ip_requests[ip] = [(ts, ep) for ts, ep in self.ip_requests[ip] if current_time - ts < time_window]

        # 仅统计当前端点的请求次数
        endpoint_entries = [(ts, ep) for ts, ep in self.ip_requests[ip] if ep == endpoint]
        request_count = len(endpoint_entries)

        # 超过限制
        if request_count >= max_requests:
            # 严重超限（2 倍）→ 临时封禁 5 分钟
            if request_count >= max_requests * 2:
                block_until = current_time + 300
                self.blocked_ips[ip] = block_until
                log_ip_blocked(ip=ip, duration_seconds=300)
                logger.warning("IP %s 因严重超过速率限制被阻止 5 分钟", ip)
                return False, 300

            oldest = min(endpoint_entries, key=lambda x: x[0])[0]
            return False, int(oldest + time_window - current_time)

        # 记录本次请求
        self.ip_requests[ip].append((current_time, endpoint))
        return True, None

    def clear_ip(self, ip: str):
        """清除特定 IP 的请求记录（用于登录成功后重置计数）"""
        self.ip_requests.pop(ip, None)
        self.blocked_ips.pop(ip, None)


# 全局实例（进程级）
ip_rate_limiter = IPRateLimiter()


def check_auth_rate_limit(request: Request, endpoint: str = "auth") -> None:
    """
    检查认证端点的速率限制，超限时抛出 429

    参数:
        request: FastAPI 请求对象
        endpoint: 端点标识（register / login / refresh / reset_password / verify_send）
    """
    ip = get_client_ip(request)
    max_requests, time_window = AUTH_RATE_LIMITS.get(endpoint, _DEFAULT_AUTH_LIMIT)

    allowed, retry_after = ip_rate_limiter.check_rate_limit(ip, endpoint, max_requests, time_window)

    if not allowed:
        log_rate_limit_hit(ip=ip, endpoint=endpoint, limit=f"{max_requests}/{time_window}s")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "auth_rate_limit_exceeded",
                "message": f"认证请求过于频繁，请{retry_after}秒后再试",
                "retry_after": retry_after,
            },
        )
