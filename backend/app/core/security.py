"""
安全模块 - JWT令牌和密码处理
"""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

# 密码加密上下文 - 使用 bcrypt 单向哈希
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码 - 使用 bcrypt 哈希验证"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """获取密码哈希 - 使用 bcrypt 单向哈希"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建JWT访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """解码JWT令牌"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


def generate_secure_random_string(length: int = 32) -> str:
    """生成安全的随机字符串，用于密钥和令牌生成"""
    return secrets.token_urlsafe(length)


def validate_secret_key_strength(key: str) -> tuple[bool, str]:
    """
    验证密钥强度
    返回: (is_valid, error_message)
    """
    if len(key) < 32:
        return False, "密钥长度至少需要 32 个字符"

    # 检查密钥是否包含足够的熵（至少包含三种字符类型）
    has_lower = any(c.islower() for c in key)
    has_upper = any(c.isupper() for c in key)
    has_digit = any(c.isdigit() for c in key)
    has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in key)

    complexity_count = sum([has_lower, has_upper, has_digit, has_special])
    if complexity_count < 3:
        return False, "密钥必须包含至少三种字符类型（大小写字母、数字、特殊符号）"

    return True, ""
