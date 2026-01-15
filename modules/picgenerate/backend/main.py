"""
Picgenerate - AI 图像生成微服务

执行流程：
1. 接收用户的中文 prompt
2. 调用翻译 AI 将中文 prompt 优化为英文绘图 prompt（流式输出 thinking）
3. 调用绘图 AI 生成图像
4. 上传图像到 R2
5. 返回图像链接

全过程以 thinking 形式流式输出给主项目
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, AsyncGenerator
import uuid
import json
import asyncio
from datetime import datetime

from config import settings
from prompt_translator import get_translator, PromptTranslatorError
from ai_generator import get_generator, ImageGeneratorError
from storage import storage_service

app = FastAPI(
    title="Picgenerate - AI 图像生成服务",
    description="基于 OpenAI 格式 API 的图像生成微服务，支持 Gemini-3-image 等模型",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    """图像生成请求"""
    prompt: str = Field(..., description="图像描述提示词（中文或英文）", max_length=2000)
    size: str = Field(default="1024x1024", description="图像尺寸")
    quality: str = Field(default="standard", description="图像质量 (standard/hd)")
    user_id: Optional[str] = Field(default="anonymous", description="用户标识")


class GenerateResponse(BaseModel):
    """生成结果响应"""
    success: bool
    image_url: Optional[str] = None
    english_prompt: Optional[str] = None
    error: Optional[str] = None


@app.get("/")
async def root():
    """服务状态"""
    return {
        "service": "picgenerate",
        "status": "running",
        "version": "1.0.0",
        "translator_model": settings.TRANSLATOR_MODEL,
        "image_model": settings.IMAGE_MODEL
    }


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "healthy"}


def _sse(event_type: str, data) -> str:
    """生成 SSE 格式的消息"""
    return f"data: {json.dumps({'type': event_type, 'data': data}, ensure_ascii=False)}\n\n"


async def generate_stream(request: GenerateRequest) -> AsyncGenerator[str, None]:
    """
    流式生成图像，输出 thinking 过程
    
    SSE 格式：
    - type: thinking  - 思考/处理过程
    - type: content   - 最终结果
    - type: error     - 错误信息
    - type: done      - 完成标记
    """
    english_prompt = ""
    NL = "\n"  # 换行符常量，用于在 f-string 中引用
    
    try:
        # ========== 阶段 1: 翻译优化 Prompt ==========
        yield _sse("thinking", "📝 正在分析您的描述...")
        await asyncio.sleep(0)
        
        yield _sse("thinking", f"{NL}原始描述: {request.prompt}{NL}")
        await asyncio.sleep(0)
        
        yield _sse("thinking", f"{NL}🔄 正在优化为专业绘图提示词...{NL}")
        await asyncio.sleep(0)
        
        # 流式获取翻译结果
        translator = get_translator()
        yield _sse("thinking", f"{NL}优化后的英文提示词:{NL}")
        await asyncio.sleep(0)
        
        async for chunk in translator.translate_stream(request.prompt):
            english_prompt += chunk
            yield _sse("thinking", chunk)
            await asyncio.sleep(0)
        
        if not english_prompt.strip():
            raise PromptTranslatorError("翻译结果为空")
        
        yield _sse("thinking", f"{NL}{NL}✅ 提示词优化完成")
        await asyncio.sleep(0)
        
        # ========== 阶段 2: 生成图像 ==========
        yield _sse("thinking", f"{NL}{NL}🎨 正在调用 {settings.IMAGE_MODEL} 生成图像...")
        await asyncio.sleep(0)
        
        yield _sse("thinking", f"{NL}⏳ 图像生成中，请稍候（通常需要 10-30 秒）...")
        await asyncio.sleep(0)
        
        generator = get_generator()
        image_data = await generator.generate(
            prompt=english_prompt.strip(),
            size=request.size,
            quality=request.quality
        )
        
        yield _sse("thinking", f"{NL}✅ 图像生成成功")
        await asyncio.sleep(0)
        
        # ========== 阶段 3: 上传到 R2 ==========
        yield _sse("thinking", f"{NL}{NL}☁️ 正在上传图像到云存储...")
        await asyncio.sleep(0)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        key = f"generated/{request.user_id}/{timestamp}_{unique_id}.png"
        
        image_url = storage_service.upload_image(key, image_data)
        
        yield _sse("thinking", f"{NL}✅ 上传完成")
        await asyncio.sleep(0)
        
        # ========== 阶段 4: 返回结果 ==========
        yield _sse("thinking", f"{NL}{NL}🎉 全部完成！")
        await asyncio.sleep(0)
        
        # 发送最终结果
        result = {
            "type": "content",
            "data": {
                "success": True,
                "image_url": image_url,
                "english_prompt": english_prompt.strip()
            }
        }
        yield f"data: {json.dumps(result, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0)
        
        # 完成标记
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    except PromptTranslatorError as e:
        error_msg = f"翻译优化失败: {str(e)}"
        yield _sse("thinking", f"{NL}{NL}❌ {error_msg}")
        yield _sse("error", error_msg)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    except ImageGeneratorError as e:
        error_msg = f"图像生成失败: {str(e)}"
        yield _sse("thinking", f"{NL}{NL}❌ {error_msg}")
        yield _sse("error", error_msg)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    except Exception as e:
        error_msg = f"未知错误: {str(e)}"
        yield _sse("thinking", f"{NL}{NL}❌ {error_msg}")
        yield _sse("error", error_msg)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"


@app.post("/api/generate/stream")
async def generate_image_stream(request: GenerateRequest):
    """
    流式生成图像（推荐）
    
    返回 SSE 流，包含完整的处理过程（thinking）和最终结果
    """
    return StreamingResponse(
        generate_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_image(request: GenerateRequest):
    """
    同步生成图像（简单模式）
    
    不返回 thinking 过程，直接等待完成后返回结果
    """
    try:
        # 1. 翻译优化 prompt
        translator = get_translator()
        english_prompt = await translator.translate(request.prompt)
        
        if not english_prompt.strip():
            raise PromptTranslatorError("翻译结果为空")
        
        # 2. 生成图像
        generator = get_generator()
        image_data = await generator.generate(
            prompt=english_prompt.strip(),
            size=request.size,
            quality=request.quality
        )
        
        # 3. 上传到 R2
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        key = f"generated/{request.user_id}/{timestamp}_{unique_id}.png"
        
        image_url = storage_service.upload_image(key, image_data)
        
        return GenerateResponse(
            success=True,
            image_url=image_url,
            english_prompt=english_prompt.strip()
        )
        
    except (PromptTranslatorError, ImageGeneratorError) as e:
        return GenerateResponse(success=False, error=str(e))
    except Exception as e:
        return GenerateResponse(success=False, error=f"生成失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
