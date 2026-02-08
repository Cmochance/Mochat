"""
验证码API路由
"""
from fastapi import APIRouter, Request, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .schemas import SendCodeRequest, SendCodeResponse
from .service import VerificationService
from .config import config
from app.db.database import get_db

router = APIRouter(prefix="/verify", tags=["验证码"])


def get_client_ip(request: Request) -> str:
    """获取客户端真实IP"""
    # 优先从代理头获取
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # 直接连接
    return request.client.host if request.client else "unknown"


@router.post("/send", response_model=SendCodeResponse)
async def send_verification_code(
    request: SendCodeRequest,
    req: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    发送验证码到邮箱
    
    - **email**: 接收验证码的邮箱地址
    - **purpose**: 用途，register=注册，reset_password=重置密码
    
    限制：
    - 同一邮箱60秒内只能发送一次
    - 同一IP每小时最多发送10次
    - 验证码5分钟有效
    """
    ip = get_client_ip(req)
    
    success, message, cooldown = await VerificationService.send_code(
        db,
        email=request.email,
        purpose=request.purpose,
        ip=ip
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS if cooldown > 0 else status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return SendCodeResponse(
        success=True,
        message=message,
        expires_in=config.CODE_EXPIRE_MINUTES * 60,
        cooldown=cooldown
    )


@router.get("/cooldown")
async def get_cooldown(
    email: str,
    purpose: str,
    db: AsyncSession = Depends(get_db),
):
    """
    获取验证码发送冷却时间
    
    用于前端显示倒计时
    """
    if purpose not in config.VALID_PURPOSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的验证用途"
        )
    
    cooldown = await VerificationService.get_cooldown(db, email, purpose)
    
    return {
        "email": email,
        "purpose": purpose,
        "cooldown": cooldown,
        "can_send": cooldown == 0
    }
