"""
PPT 生成微服务

执行流程：
1. 接收用户的 prompt
2. 调用 AI 生成 PPT 的 JSON 结构（流式输出 thinking）
3. 调用 Cloud Run 服务将 JSON 转换为 PPTX 并上传到 R2
4. 返回下载链接

全过程以 thinking 形式流式输出给主项目
"""
from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, AsyncGenerator
import json
import asyncio
import uuid

from config import settings
from ai_generator import get_ai_generator, AIGeneratorError
from cloudrun_client import get_cloudrun_client, CloudRunError

app = FastAPI(
    title="PPT 生成服务",
    description="基于 AI 的 PPT 自动生成微服务",
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
    """PPT 生成请求"""
    prompt: str = Field(..., description="PPT 主题描述", max_length=5000)
    user_id: Optional[str] = Field(default="anonymous", description="用户标识")


class GenerateResponse(BaseModel):
    """生成结果响应"""
    success: bool
    pptUrl: Optional[str] = None  # 使用驼峰命名匹配前端
    title: Optional[str] = None
    error: Optional[str] = None


@app.get("/")
async def root():
    """服务状态"""
    return {
        "service": "pptgen",
        "status": "running",
        "version": "1.0.0",
        "ai_model": settings.AI_MODEL
    }


@app.get("/health")
async def health():
    """健康检查（含依赖就绪状态）"""
    missing_configs = []
    if not settings.AI_API_KEY:
        missing_configs.append("PPTGEN_AI_API_KEY")
    if not settings.AI_API_BASE:
        missing_configs.append("PPTGEN_AI_API_BASE")
    if not settings.CLOUDRUN_URL:
        missing_configs.append("PPTGEN_CLOUDRUN_URL")

    cloudrun_ok = False
    cloudrun_detail = "not_checked"
    if settings.CLOUDRUN_URL:
        try:
            cloudrun_client = get_cloudrun_client()
            cloudrun_ok, cloudrun_detail = await cloudrun_client.healthcheck(
                request_id=f"health-{uuid.uuid4()}"
            )
        except CloudRunError as e:
            cloudrun_detail = str(e)

    ready = (len(missing_configs) == 0) and cloudrun_ok
    return {
        "status": "healthy" if ready else "degraded",
        "ready": ready,
        "checks": {
            "ai_configured": bool(settings.AI_API_KEY and settings.AI_API_BASE),
            "cloudrun_configured": bool(settings.CLOUDRUN_URL),
            "cloudrun_reachable": cloudrun_ok,
            "cloudrun_detail": cloudrun_detail,
        },
        "missing_configs": missing_configs,
    }


def resolve_request_id(x_request_id: str | None) -> str:
    return (x_request_id or "").strip() or str(uuid.uuid4())


def make_sse(data_type: str, data: str) -> str:
    """生成 SSE 格式数据"""
    return f"data: {json.dumps({'type': data_type, 'data': data}, ensure_ascii=False)}\n\n"


async def generate_stream(request: GenerateRequest, request_id: str) -> AsyncGenerator[str, None]:
    """
    流式生成 PPT，输出 thinking 过程
    
    SSE 格式：
    - type: thinking  - 思考/处理过程
    - type: content   - 最终结果
    - type: error     - 错误信息
    - type: done      - 完成标记
    """
    json_content = ""
    ppt_title = ""
    NL = "\n"  # 换行符变量，用于 f-string
    
    try:
        # ========== 阶段 1: 分析需求 ==========
        yield make_sse('thinking', '📝 正在分析您的需求...')
        await asyncio.sleep(0)
        
        yield make_sse('thinking', f'{NL}主题: {request.prompt}{NL}')
        await asyncio.sleep(0)
        
        # ========== 阶段 2: AI 生成 JSON ==========
        yield make_sse('thinking', f'{NL}🤖 正在生成 PPT 结构...{NL}')
        await asyncio.sleep(0)
        
        ai_generator = get_ai_generator()
        
        # 流式获取 AI 响应
        yield make_sse('thinking', f'{NL}--- AI 生成中 ---{NL}')
        await asyncio.sleep(0)
        
        async for chunk in ai_generator.generate_json_stream(request.prompt):
            json_content += chunk
            # 每个 chunk 都输出，让用户看到生成过程
            yield make_sse('thinking', chunk)
            await asyncio.sleep(0)
        
        yield make_sse('thinking', f'{NL}--- AI 生成完成 ---{NL}')
        await asyncio.sleep(0)
        
        # ========== 阶段 3: 解析并验证 JSON ==========
        yield make_sse('thinking', f'{NL}✅ 正在验证 PPT 结构...')
        await asyncio.sleep(0)
        
        # 清理可能的 markdown 标记
        clean_json = json_content.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()
        
        try:
            ppt_data = json.loads(clean_json)
        except json.JSONDecodeError as e:
            raise AIGeneratorError(f"AI 返回的 JSON 格式无效: {str(e)}")
        
        # 验证必要字段
        if "title" not in ppt_data:
            ppt_data["title"] = "演示文稿"
        if "slides" not in ppt_data or not ppt_data["slides"]:
            raise AIGeneratorError("AI 返回的 PPT 结构缺少幻灯片内容")
        
        ppt_title = ppt_data["title"]
        slide_count = len(ppt_data["slides"])
        
        yield make_sse('thinking', f'{NL}✅ 验证通过！PPT 标题: {ppt_title}，共 {slide_count} 页{NL}')
        await asyncio.sleep(0)
        
        # ========== 阶段 4: 调用 Cloud Run 生成 PPTX 并上传 R2 ==========
        yield make_sse('thinking', f'{NL}🔧 正在生成 PPT 文件...')
        await asyncio.sleep(0)
        
        yield make_sse('thinking', f'{NL}⏳ 正在调用 PPT 生成服务（可能需要 10-30 秒）...')
        await asyncio.sleep(0)
        
        cloudrun_client = get_cloudrun_client()
        result = await cloudrun_client.generate_pptx(
            ppt_data,
            request.user_id,
            request_id=request_id,
        )
        
        yield make_sse('thinking', f'{NL}✅ PPT 文件生成成功！')
        await asyncio.sleep(0)
        
        yield make_sse('thinking', f'{NL}☁️ 文件已上传到云存储')
        await asyncio.sleep(0)
        
        ppt_url = result.url
        ppt_title = result.title
        
        # ========== 阶段 5: 返回结果 ==========
        yield make_sse('thinking', f'{NL}{NL}🎉 PPT 生成完成！')
        await asyncio.sleep(0)
        
        # 发送最终结果
        result = {
            "type": "content",
            "data": {
                "success": True,
                "pptUrl": ppt_url,  # 使用驼峰命名匹配前端
                "title": ppt_title
            }
        }
        yield f"data: {json.dumps(result, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0)
        
        # 完成标记
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    except AIGeneratorError as e:
        error_msg = f"AI 生成失败: {str(e)}"
        yield make_sse('thinking', f'{NL}{NL}❌ {error_msg}')
        yield make_sse('error', error_msg)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    except CloudRunError as e:
        error_msg = f"PPT 生成失败: {str(e)}"
        yield make_sse('thinking', f'{NL}{NL}❌ {error_msg}')
        yield make_sse('error', error_msg)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    except Exception as e:
        error_msg = f"未知错误: {str(e)}"
        yield make_sse('thinking', f'{NL}{NL}❌ {error_msg}')
        yield make_sse('error', error_msg)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"


@app.post("/api/generate/stream")
async def generate_ppt_stream(
    request: GenerateRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
):
    """
    流式生成 PPT（推荐）
    
    返回 SSE 流，包含完整的处理过程（thinking）和最终结果
    """
    request_id = resolve_request_id(x_request_id)
    return StreamingResponse(
        generate_stream(request, request_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Request-ID": request_id,
        }
    )


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_ppt(
    request: GenerateRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-ID"),
):
    """
    同步生成 PPT（简单模式）
    
    不返回 thinking 过程，直接等待完成后返回结果
    """
    request_id = resolve_request_id(x_request_id)
    try:
        # 1. AI 生成 JSON
        ai_generator = get_ai_generator()
        json_content = await ai_generator.generate_json(request.prompt)
        
        # 清理并解析 JSON
        clean_json = json_content.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        
        ppt_data = json.loads(clean_json.strip())
        
        # 2. 调用 Cloud Run 生成 PPTX 并上传 R2
        cloudrun_client = get_cloudrun_client()
        result = await cloudrun_client.generate_pptx(
            ppt_data,
            request.user_id,
            request_id=request_id,
        )
        
        return GenerateResponse(
            success=True,
            pptUrl=result.url,
            title=result.title
        )
        
    except (AIGeneratorError, CloudRunError) as e:
        return GenerateResponse(success=False, error=str(e))
    except json.JSONDecodeError as e:
        return GenerateResponse(success=False, error=f"JSON 解析失败: {str(e)}")
    except Exception as e:
        return GenerateResponse(success=False, error=f"生成失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
