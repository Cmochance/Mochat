"""
验证码核心服务（数据库持久化）
"""
from __future__ import annotations

import random
import string
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import config
from .email import email_service
from app.db.models import VerificationCode, VerificationIPLimit


class VerificationService:
    """验证码服务"""

    @staticmethod
    def _generate_code() -> str:
        """生成随机验证码"""
        return "".join(random.choices(string.digits, k=config.CODE_LENGTH))

    @staticmethod
    def _normalize_email(email: str) -> str:
        return (email or "").strip().lower()

    @staticmethod
    def _lock_deadline(record: VerificationCode) -> datetime:
        return record.created_at + timedelta(minutes=config.LOCKOUT_MINUTES)

    @staticmethod
    def _is_locked(record: VerificationCode, now: datetime) -> bool:
        if record.attempts < config.MAX_ATTEMPTS:
            return False
        return now < VerificationService._lock_deadline(record)

    @staticmethod
    def _is_expired(record: VerificationCode, now: datetime) -> bool:
        return now >= record.expires_at

    @classmethod
    async def _get_code_record(
        cls,
        db: AsyncSession,
        email: str,
        purpose: str,
    ) -> VerificationCode | None:
        result = await db.execute(
            select(VerificationCode).where(
                VerificationCode.email == email,
                VerificationCode.purpose == purpose,
            )
        )
        return result.scalar_one_or_none()

    @classmethod
    async def _check_ip_limit(cls, db: AsyncSession, ip: str) -> tuple[bool, int]:
        now = datetime.utcnow()
        result = await db.execute(select(VerificationIPLimit).where(VerificationIPLimit.ip == ip))
        record = result.scalar_one_or_none()
        if not record:
            record = VerificationIPLimit(ip=ip, count=0, reset_at=now + timedelta(hours=1))
            db.add(record)
            await db.flush()
        elif now >= record.reset_at:
            record.count = 0
            record.reset_at = now + timedelta(hours=1)
            await db.flush()

        remaining = config.IP_HOURLY_LIMIT - int(record.count or 0)
        return remaining > 0, remaining

    @classmethod
    async def _increment_ip_count(cls, db: AsyncSession, ip: str) -> None:
        now = datetime.utcnow()
        result = await db.execute(select(VerificationIPLimit).where(VerificationIPLimit.ip == ip))
        record = result.scalar_one_or_none()
        if not record:
            record = VerificationIPLimit(ip=ip, count=1, reset_at=now + timedelta(hours=1))
            db.add(record)
        else:
            if now >= record.reset_at:
                record.count = 1
                record.reset_at = now + timedelta(hours=1)
            else:
                record.count = int(record.count or 0) + 1
        await db.flush()

    @classmethod
    async def send_code(
        cls,
        db: AsyncSession,
        email: str,
        purpose: str,
        ip: str
    ) -> tuple[bool, str, int]:
        """
        发送验证码

        Returns:
            (success, message, cooldown_seconds)
        """
        normalized_email = cls._normalize_email(email)
        now = datetime.utcnow()

        # 验证用途
        if purpose not in config.VALID_PURPOSES:
            return False, "无效的验证用途", 0

        # 检查 IP 限流
        ip_allowed, _ = await cls._check_ip_limit(db, ip)
        if not ip_allowed:
            return False, "发送次数已达上限，请稍后再试", 0

        # 检查发送冷却
        can_send, cooldown = await cls.can_send(db, normalized_email, purpose)
        if not can_send:
            if cooldown > config.SEND_COOLDOWN_SECONDS:
                return False, f"验证码错误次数过多，请{cooldown // 60}分钟后再试", cooldown
            return False, f"请{cooldown}秒后再试", cooldown

        # 生成验证码并发送邮件
        code = cls._generate_code()
        success, error = await email_service.send_verification_email(normalized_email, code, purpose)
        if not success:
            return False, error or "发送失败", 0

        expires_at = now + timedelta(minutes=config.CODE_EXPIRE_MINUTES)
        record = await cls._get_code_record(db, normalized_email, purpose)
        if record:
            record.code = code
            record.attempts = 0
            record.created_at = now
            record.verified = False
            record.expires_at = expires_at
        else:
            db.add(
                VerificationCode(
                    email=normalized_email,
                    purpose=purpose,
                    code=code,
                    attempts=0,
                    created_at=now,
                    verified=False,
                    expires_at=expires_at,
                )
            )
        await db.flush()
        await cls._increment_ip_count(db, ip)

        return True, "验证码已发送", config.SEND_COOLDOWN_SECONDS

    @classmethod
    async def can_send(cls, db: AsyncSession, email: str, purpose: str) -> tuple[bool, int]:
        """检查是否可以发送验证码（冷却或锁定）"""
        now = datetime.utcnow()
        record = await cls._get_code_record(db, email, purpose)
        if not record:
            return True, 0

        if cls._is_locked(record, now):
            remaining = int((cls._lock_deadline(record) - now).total_seconds())
            return False, max(0, remaining)

        elapsed = (now - record.created_at).total_seconds()
        if elapsed < config.SEND_COOLDOWN_SECONDS:
            return False, int(config.SEND_COOLDOWN_SECONDS - elapsed)

        return True, 0

    @classmethod
    async def verify_code(
        cls,
        db: AsyncSession,
        email: str,
        code: str,
        purpose: str
    ) -> tuple[bool, str, int]:
        """
        验证验证码

        Returns:
            (success, message, remaining_attempts)
        """
        normalized_email = cls._normalize_email(email)
        input_code = (code or "").strip()
        now = datetime.utcnow()

        if purpose not in config.VALID_PURPOSES:
            return False, "无效的验证用途", 0

        record = await cls._get_code_record(db, normalized_email, purpose)
        if not record:
            return False, "验证码不存在或已过期，请重新发送", 0

        if cls._is_locked(record, now):
            remaining = int((cls._lock_deadline(record) - now).total_seconds())
            return False, f"错误次数过多，请{max(0, remaining) // 60}分钟后再试", 0

        if cls._is_expired(record, now):
            await db.delete(record)
            await db.flush()
            return False, "验证码已过期，请重新发送", 0

        remaining_attempts = config.MAX_ATTEMPTS - int(record.attempts or 0) - 1
        if record.code != input_code:
            record.attempts = int(record.attempts or 0) + 1
            await db.flush()
            if remaining_attempts <= 0:
                return False, "验证码错误次数过多，请30分钟后再试", 0
            return False, f"验证码错误，还剩{remaining_attempts}次机会", remaining_attempts

        record.verified = True
        await db.flush()
        return True, "验证成功", 0

    @classmethod
    async def check_verified(cls, db: AsyncSession, email: str, purpose: str) -> bool:
        """检查邮箱是否已验证"""
        normalized_email = cls._normalize_email(email)
        record = await cls._get_code_record(db, normalized_email, purpose)
        return bool(record and record.verified)

    @classmethod
    async def consume_verification(cls, db: AsyncSession, email: str, purpose: str) -> None:
        """消费验证（删除记录，防止重复使用）"""
        normalized_email = cls._normalize_email(email)
        record = await cls._get_code_record(db, normalized_email, purpose)
        if record:
            await db.delete(record)
            await db.flush()

    @classmethod
    async def get_cooldown(cls, db: AsyncSession, email: str, purpose: str) -> int:
        """获取当前冷却剩余时间（秒）"""
        normalized_email = cls._normalize_email(email)
        can_send, cooldown = await cls.can_send(db, normalized_email, purpose)
        return 0 if can_send else cooldown

