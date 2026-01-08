"""
验证码缓存管理 - 使用内存缓存（TTLCache）
"""
import time
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from threading import Lock
from .config import config


@dataclass
class VerificationRecord:
    """验证码记录"""
    code: str
    attempts: int = 0
    created_at: float = field(default_factory=time.time)
    verified: bool = False
    
    def is_expired(self) -> bool:
        """检查是否过期"""
        expire_seconds = config.CODE_EXPIRE_MINUTES * 60
        return time.time() - self.created_at > expire_seconds
    
    def is_locked(self) -> bool:
        """检查是否被锁定（错误次数超限）"""
        if self.attempts < config.MAX_ATTEMPTS:
            return False
        # 检查锁定时间
        lockout_seconds = config.LOCKOUT_MINUTES * 60
        return time.time() - self.created_at < lockout_seconds


@dataclass
class IPLimitRecord:
    """IP限制记录"""
    count: int = 0
    reset_at: float = field(default_factory=lambda: time.time() + 3600)
    
    def is_reset_needed(self) -> bool:
        """检查是否需要重置"""
        return time.time() > self.reset_at
    
    def reset(self):
        """重置计数"""
        self.count = 0
        self.reset_at = time.time() + 3600


class VerificationCache:
    """验证码缓存管理器"""
    
    def __init__(self):
        self._verification_cache: Dict[str, VerificationRecord] = {}
        self._ip_cache: Dict[str, IPLimitRecord] = {}
        self._lock = Lock()
    
    def _get_key(self, email: str, purpose: str) -> str:
        """生成缓存键"""
        return f"{purpose}:{email.lower()}"
    
    # ==================== 验证码缓存 ====================
    
    def set_code(self, email: str, purpose: str, code: str) -> None:
        """设置验证码"""
        key = self._get_key(email, purpose)
        with self._lock:
            self._verification_cache[key] = VerificationRecord(code=code)
    
    def get_record(self, email: str, purpose: str) -> Optional[VerificationRecord]:
        """获取验证码记录"""
        key = self._get_key(email, purpose)
        with self._lock:
            record = self._verification_cache.get(key)
            if record and record.is_expired() and not record.is_locked():
                # 过期且未锁定，删除记录
                del self._verification_cache[key]
                return None
            return record
    
    def increment_attempts(self, email: str, purpose: str) -> int:
        """增加尝试次数，返回当前次数"""
        key = self._get_key(email, purpose)
        with self._lock:
            record = self._verification_cache.get(key)
            if record:
                record.attempts += 1
                return record.attempts
            return 0
    
    def mark_verified(self, email: str, purpose: str) -> None:
        """标记为已验证"""
        key = self._get_key(email, purpose)
        with self._lock:
            record = self._verification_cache.get(key)
            if record:
                record.verified = True
    
    def is_verified(self, email: str, purpose: str) -> bool:
        """检查是否已验证"""
        key = self._get_key(email, purpose)
        with self._lock:
            record = self._verification_cache.get(key)
            return record is not None and record.verified
    
    def delete(self, email: str, purpose: str) -> None:
        """删除验证码记录"""
        key = self._get_key(email, purpose)
        with self._lock:
            self._verification_cache.pop(key, None)
    
    def can_send(self, email: str, purpose: str) -> tuple[bool, int]:
        """
        检查是否可以发送验证码
        返回: (可以发送, 剩余冷却秒数)
        """
        key = self._get_key(email, purpose)
        with self._lock:
            record = self._verification_cache.get(key)
            if not record:
                return True, 0
            
            # 检查是否被锁定
            if record.is_locked():
                remaining = int(config.LOCKOUT_MINUTES * 60 - (time.time() - record.created_at))
                return False, max(0, remaining)
            
            # 检查发送冷却
            elapsed = time.time() - record.created_at
            if elapsed < config.SEND_COOLDOWN_SECONDS:
                remaining = int(config.SEND_COOLDOWN_SECONDS - elapsed)
                return False, remaining
            
            return True, 0
    
    # ==================== IP限制缓存 ====================
    
    def check_ip_limit(self, ip: str) -> tuple[bool, int]:
        """
        检查IP是否超限
        返回: (是否允许, 剩余配额)
        """
        with self._lock:
            record = self._ip_cache.get(ip)
            
            if not record:
                record = IPLimitRecord()
                self._ip_cache[ip] = record
            elif record.is_reset_needed():
                record.reset()
            
            remaining = config.IP_HOURLY_LIMIT - record.count
            return remaining > 0, remaining
    
    def increment_ip_count(self, ip: str) -> None:
        """增加IP发送计数"""
        with self._lock:
            record = self._ip_cache.get(ip)
            if record:
                if record.is_reset_needed():
                    record.reset()
                record.count += 1
            else:
                record = IPLimitRecord(count=1)
                self._ip_cache[ip] = record
    
    # ==================== 清理 ====================
    
    def cleanup(self) -> int:
        """清理过期记录，返回清理数量"""
        cleaned = 0
        with self._lock:
            # 清理验证码缓存
            expired_keys = [
                key for key, record in self._verification_cache.items()
                if record.is_expired() and not record.is_locked()
            ]
            for key in expired_keys:
                del self._verification_cache[key]
                cleaned += 1
            
            # 清理IP缓存
            expired_ips = [
                ip for ip, record in self._ip_cache.items()
                if record.is_reset_needed() and record.count == 0
            ]
            for ip in expired_ips:
                del self._ip_cache[ip]
                cleaned += 1
        
        return cleaned


# 全局缓存实例
cache = VerificationCache()
