"""
Uppic 配置管理
"""
import os
from typing import List
from pathlib import Path

# 尝试加载 .env 文件
try:
    from dotenv import load_dotenv
    # 查找项目根目录的 .env 或模块目录的 .env
    root_env = Path(__file__).parent.parent.parent.parent / ".env"
    local_env = Path(__file__).parent.parent / ".env"
    
    if local_env.exists():
        load_dotenv(local_env)
    elif root_env.exists():
        load_dotenv(root_env)
except ImportError:
    pass


class Settings:
    """Uppic 服务配置"""
    
    # 服务配置
    PORT: int = int(os.getenv("UPPIC_PORT", "3900"))
    DEBUG: bool = os.getenv("UPPIC_DEBUG", "false").lower() == "true"
    
    # CORS 配置
    CORS_ORIGINS: List[str] = os.getenv(
        "UPPIC_CORS_ORIGINS",
        "http://localhost:3721,http://localhost:3000,http://localhost:5173"
    ).split(",")
    
    # Cloudflare R2 配置
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "")
    R2_PUBLIC_DOMAIN: str = os.getenv("R2_PUBLIC_DOMAIN", "")


settings = Settings()
