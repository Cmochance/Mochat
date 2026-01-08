"""
验证码模块 - 完全解耦的邮箱验证服务

提供功能：
- 发送验证码到邮箱
- 验证验证码
- IP限制和发送频率控制

使用方式：
    from verify import verify_router, VerificationService
    
    # 注册路由
    app.include_router(verify_router, prefix="/api")
    
    # 验证验证码
    is_valid, msg = VerificationService.verify_code(email, code, "register")
"""

from .router import router as verify_router
from .service import VerificationService

__all__ = ["verify_router", "VerificationService"]
