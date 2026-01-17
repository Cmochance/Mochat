"""
PPT 生成模块配置管理
"""
import os
from typing import List
from pathlib import Path

# 尝试加载 .env 文件
try:
    from dotenv import load_dotenv
    root_env = Path(__file__).parent.parent.parent.parent / ".env"
    local_env = Path(__file__).parent / ".env"
    
    if local_env.exists():
        load_dotenv(local_env)
    elif root_env.exists():
        load_dotenv(root_env)
except ImportError:
    pass


class Settings:
    """PPT 生成服务配置"""
    
    # 服务配置
    PORT: int = int(os.getenv("PPTGEN_PORT", "3904"))
    
    # CORS 配置
    CORS_ORIGINS: List[str] = os.getenv(
        "PPTGEN_CORS_ORIGINS",
        "http://localhost:3721,http://localhost:38721"
    ).split(",")
    
    # AI API 配置（用于生成 JSON）
    AI_API_KEY: str = os.getenv("PPTGEN_AI_API_KEY", "")
    AI_API_BASE: str = os.getenv("PPTGEN_AI_API_BASE", "")
    AI_MODEL: str = os.getenv("PPTGEN_AI_MODEL", "gpt-4")
    
    # Cloud Run PPT 生成服务配置
    CLOUDRUN_URL: str = os.getenv("PPTGEN_CLOUDRUN_URL", "")
    CLOUDRUN_SECRET: str = os.getenv("PPTGEN_CLOUDRUN_SECRET", "") or os.getenv("AUTH_TOKEN", "")
    
    # Cloudflare R2 配置
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "")
    R2_PUBLIC_DOMAIN: str = os.getenv("R2_PUBLIC_DOMAIN", "")
    
    # 缓存配置
    CACHE_CONTROL: str = "public, max-age=31536000, immutable"


settings = Settings()
