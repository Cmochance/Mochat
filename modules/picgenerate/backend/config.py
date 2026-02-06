"""
Picgenerate 配置管理
从项目根目录的 .env 文件读取配置
"""
import os
from typing import List
from pathlib import Path

# 加载根目录 .env 文件
try:
    from dotenv import load_dotenv
    root_env = Path(__file__).parent.parent.parent.parent / ".env"
    if root_env.exists():
        load_dotenv(root_env)
except ImportError:
    pass


class Settings:
    """Picgenerate 服务配置"""
    
    # 服务配置
    PORT: int = int(os.getenv("PICGEN_PORT", "3903"))
    DEBUG: bool = os.getenv("PICGEN_DEBUG", "false").lower() == "true"
    
    # CORS 配置
    CORS_ORIGINS: List[str] = os.getenv(
        "PICGEN_CORS_ORIGINS",
        "http://localhost:3721,http://localhost:5173,http://localhost:38721"
    ).split(",")
    
    # ========== Prompt 翻译/优化 AI（OpenAI 格式）==========
    # 用于将用户输入的中文 prompt 翻译优化为英文绘图 prompt
    TRANSLATOR_API_KEY: str = os.getenv("PICGEN_TRANSLATOR_API_KEY", "")
    TRANSLATOR_API_BASE: str = os.getenv("PICGEN_TRANSLATOR_API_BASE", "")
    TRANSLATOR_MODEL: str = os.getenv("PICGEN_TRANSLATOR_MODEL", "gpt-4o-mini")
    
    # ========== 图像生成 AI（OpenAI 格式）==========
    # 用于根据英文 prompt 生成图像
    IMAGE_API_KEY: str = os.getenv("PICGEN_IMAGE_API_KEY", "")
    IMAGE_API_BASE: str = os.getenv("PICGEN_IMAGE_API_BASE", "")
    IMAGE_MODEL: str = os.getenv("PICGEN_IMAGE_MODEL", "gemini-3-image")
    
    # ========== Cloudflare R2 配置（与其他模块共用）==========
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "")
    R2_PUBLIC_DOMAIN: str = os.getenv("R2_PUBLIC_DOMAIN", "")
    
    # 缓存策略（AI 生成图像不可变，可长期缓存）
    CACHE_CONTROL: str = "public, max-age=31536000, immutable"
    
    # 生成配置
    DEFAULT_SIZE: str = "1024x1024"  # 默认图像尺寸
    MAX_PROMPT_LENGTH: int = 2000  # 最大提示词长度


settings = Settings()
