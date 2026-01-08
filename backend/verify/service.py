"""
验证码核心服务
"""
import random
import string
from typing import Optional
from .config import config
from .cache import cache
from .email import email_service


class VerificationService:
    """验证码服务"""
    
    @staticmethod
    def _generate_code() -> str:
        """生成随机验证码"""
        return ''.join(random.choices(string.digits, k=config.CODE_LENGTH))
    
    @classmethod
    async def send_code(
        cls,
        email: str,
        purpose: str,
        ip: str
    ) -> tuple[bool, str, int]:
        """
        发送验证码
        
        Args:
            email: 目标邮箱
            purpose: 用途 (register/reset_password)
            ip: 客户端IP
            
        Returns:
            (success, message, cooldown_seconds)
        """
        email = email.lower().strip()
        
        # 验证用途
        if purpose not in config.VALID_PURPOSES:
            return False, "无效的验证用途", 0
        
        # 检查IP限制
        ip_allowed, ip_remaining = cache.check_ip_limit(ip)
        if not ip_allowed:
            return False, "发送次数已达上限，请稍后再试", 0
        
        # 检查发送冷却
        can_send, cooldown = cache.can_send(email, purpose)
        if not can_send:
            if cooldown > config.SEND_COOLDOWN_SECONDS:
                # 被锁定
                return False, f"验证码错误次数过多，请{cooldown // 60}分钟后再试", cooldown
            return False, f"请{cooldown}秒后再试", cooldown
        
        # 生成验证码
        code = cls._generate_code()
        
        # 发送邮件
        success, error = await email_service.send_verification_email(email, code, purpose)
        if not success:
            return False, error or "发送失败", 0
        
        # 存入缓存
        cache.set_code(email, purpose, code)
        
        # 增加IP计数
        cache.increment_ip_count(ip)
        
        return True, "验证码已发送", config.SEND_COOLDOWN_SECONDS
    
    @classmethod
    def verify_code(
        cls,
        email: str,
        code: str,
        purpose: str
    ) -> tuple[bool, str, int]:
        """
        验证验证码
        
        Args:
            email: 邮箱
            code: 用户输入的验证码
            purpose: 用途
            
        Returns:
            (success, message, remaining_attempts)
        """
        email = email.lower().strip()
        code = code.strip()
        
        # 验证用途
        if purpose not in config.VALID_PURPOSES:
            return False, "无效的验证用途", 0
        
        # 获取缓存记录
        record = cache.get_record(email, purpose)
        if not record:
            return False, "验证码不存在或已过期，请重新发送", 0
        
        # 检查是否被锁定
        if record.is_locked():
            remaining = int(config.LOCKOUT_MINUTES * 60 - (
                __import__('time').time() - record.created_at
            ))
            return False, f"错误次数过多，请{remaining // 60}分钟后再试", 0
        
        # 检查是否过期
        if record.is_expired():
            cache.delete(email, purpose)
            return False, "验证码已过期，请重新发送", 0
        
        # 计算剩余次数
        remaining = config.MAX_ATTEMPTS - record.attempts - 1
        
        # 验证码比对
        if record.code != code:
            cache.increment_attempts(email, purpose)
            if remaining <= 0:
                return False, "验证码错误次数过多，请30分钟后再试", 0
            return False, f"验证码错误，还剩{remaining}次机会", remaining
        
        # 验证成功，标记为已验证
        cache.mark_verified(email, purpose)
        
        return True, "验证成功", 0
    
    @classmethod
    def check_verified(cls, email: str, purpose: str) -> bool:
        """
        检查邮箱是否已验证
        
        用于注册/重置密码时二次确认
        """
        email = email.lower().strip()
        return cache.is_verified(email, purpose)
    
    @classmethod
    def consume_verification(cls, email: str, purpose: str) -> None:
        """
        消费验证（操作成功后调用）
        
        清除验证记录，防止重复使用
        """
        email = email.lower().strip()
        cache.delete(email, purpose)
    
    @classmethod
    def get_cooldown(cls, email: str, purpose: str) -> int:
        """获取当前冷却剩余时间"""
        email = email.lower().strip()
        _, cooldown = cache.can_send(email, purpose)
        return cooldown
