"""
Upword 配置管理
"""
import os
from typing import List
from pathlib import Path

# 尝试加载 .env 文件
try:
    from dotenv import load_dotenv
    root_env = Path(__file__).parent.parent.parent.parent / ".env"
    local_env = Path(__file__).parent.parent / ".env"
    
    if local_env.exists():
        load_dotenv(local_env)
    elif root_env.exists():
        load_dotenv(root_env)
except ImportError:
    pass


class Settings:
    """Upword 服务配置"""
    
    # 服务配置
    PORT: int = int(os.getenv("UPWORD_PORT", "3901"))
    DEBUG: bool = os.getenv("UPWORD_DEBUG", "false").lower() == "true"
    
    # CORS 配置
    CORS_ORIGINS: List[str] = os.getenv(
        "UPWORD_CORS_ORIGINS",
        "http://localhost:3721,http://localhost:3000,http://localhost:5173"
    ).split(",")
    
    # Cloudflare R2 配置
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "")
    R2_PUBLIC_DOMAIN: str = os.getenv("R2_PUBLIC_DOMAIN", "")
    
    # 文档解析配置
    MAX_DOC_SIZE_MB: int = int(os.getenv("UPWORD_MAX_DOC_SIZE_MB", "20"))


settings = Settings()
