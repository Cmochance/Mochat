"""
Mochat 后端应用入口
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from verify import verify_router

from .api import api_router
from .core.config import settings
from .core.cors_validation import validate_cors_origins
from .core.error_handler import register_error_handlers
from .core.security import validate_secret_key_strength
from .core.security_headers import SecurityHeadersMiddleware
from .db.database import AsyncSessionLocal, close_db, init_db
from .services.ai_service import ai_service
from .services.auth_service import AuthService
from .services.chat_service import chat_service
from .services.supabase_auth_service import supabase_auth_service

logger = logging.getLogger(__name__)


_INSECURE_SECRET_KEYS = frozenset(
    {
        "your-super-secret-key-change-this-in-production",
        "secret",
        "change-me",
        "changeme",
    }
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 验证 SECRET_KEY 强度
    is_valid, error_msg = validate_secret_key_strength(settings.SECRET_KEY)
    if not is_valid:
        logger.error(
            f"🚨 SECRET_KEY 强度不足：{error_msg} "
            "请在 .env 中设置一个足够强度的密钥（至少32字符，包含三种字符类型）。"
            "可以使用以下命令生成安全密钥：python -c 'import secrets; print(secrets.token_urlsafe(32))'"
        )
        raise RuntimeError("SECRET_KEY 强度不足，无法启动应用")

    # 检测不安全的 SECRET_KEY
    if settings.SECRET_KEY in _INSECURE_SECRET_KEYS:
        logger.error(
            "🚨 SECRET_KEY 使用了不安全的默认值，所有用户令牌均不安全！"
            "请在 .env 中设置一个随机密钥。"
        )
        raise RuntimeError("检测到不安全的默认 SECRET_KEY")

    logger.info("✅ SECRET_KEY 强度验证通过")

    # 验证 CORS 配置
    _, cors_warnings = validate_cors_origins(settings.cors_origins_list, settings.DEBUG)
    for warning in cors_warnings:
        logger.warning(f"⚠️  CORS: {warning}")

    if not cors_warnings:
        logger.info("✅ CORS 配置验证通过")

    # 检测 SQLite 用于非调试环境
    if "sqlite" in settings.DATABASE_URL.lower() and not settings.DEBUG:
        logger.warning(
            "⚠️  当前使用 SQLite 作为数据库，不支持高并发写入。"
            " 生产环境建议切换到 PostgreSQL，参见 docker-compose.postgres.yml 示例。"
        )

    # 启动时初始化数据库
    await init_db()

    # 创建默认账号（管理员和普通用户）
    async with AsyncSessionLocal() as db:
        await AuthService.create_default_users(db)
        await db.commit()

    yield

    # 关闭时清理资源
    await ai_service.close()
    await chat_service.close()
    await supabase_auth_service.close()
    await close_db()


# 创建FastAPI应用
app = FastAPI(title="Mochat API", description="水墨风格AI对话平台后端API", version="1.0.0", lifespan=lifespan)

# 注册全局错误处理器
register_error_handlers(app)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 安全 HTTP 头中间件（在 CORS 之后添加，确保安全头不被覆盖）
app.add_middleware(SecurityHeadersMiddleware)

# 注册路由
app.include_router(api_router, prefix="/api")

# 注册验证码模块路由
app.include_router(verify_router, prefix="/api")

# 静态文件挂载 (用于服务代码解释器等工具生成的临时图表图片)
BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BACKEND_ROOT, "static")
os.makedirs(os.path.join(STATIC_DIR, "generated"), exist_ok=True)
app.mount("/api/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root():
    """根路径"""
    return {"name": "Mochat API", "version": "1.0.0", "description": "水墨风格AI对话平台"}


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}
