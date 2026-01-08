# API module
from fastapi import APIRouter
from . import auth, chat, user, admin

# 创建主路由
api_router = APIRouter()

# 注册子路由
api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(user.router, prefix="/user", tags=["用户"])
api_router.include_router(chat.router, prefix="/chat", tags=["对话"])
api_router.include_router(admin.router, prefix="/admin", tags=["管理"])
