"""
直接测试 SSE 流式输出（模拟内部调用）
在 Docker 容器内运行，测试 FastAPI StreamingResponse 的行为
"""
import asyncio
import time
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

async def test_sse():
    """测试 SSE 流式输出"""
    from app.main import app
    from app.db.database import AsyncSessionLocal
    from app.db import crud
    from app.services.auth_service import AuthService
    
    # 创建测试用户并获取 token
    async with AsyncSessionLocal() as db:
        # 获取第一个用户
        users = await crud.get_all_users(db)
        if not users:
            print("没有用户，无法测试")
            return
        
        user = users[0]
        token = AuthService.create_access_token(data={"sub": user.username})
        print(f"使用用户: {user.username}")
        
        # 获取会话
        sessions = await crud.get_user_sessions(db, user.id)
        if not sessions:
            session = await crud.create_session(db, user.id, "测试会话")
            await db.commit()
            session_id = session.id
            print(f"创建会话: {session_id}")
        else:
            session_id = sessions[0].id
            print(f"使用会话: {session_id}")
    
    # 使用 ASGI Transport 直接测试（绕过所有网络层）
    print("\n--- 测试 1: ASGI 直接调用 (绕过所有网络层) ---\n")
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        headers = {"Authorization": f"Bearer {token}"}
        
        chunk_count = 0
        start_time = time.time()
        last_time = start_time
        intervals = []
        
        async with client.stream(
            "POST",
            "/api/chat/completions",
            json={"session_id": session_id, "content": "说你好"},
            headers=headers,
            timeout=60.0
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    chunk_count += 1
                    now = time.time()
                    interval = now - last_time
                    intervals.append(interval)
                    last_time = now
                    print(f"[{now - start_time:.2f}s] (+{interval:.3f}s) Chunk #{chunk_count}")
        
        print(f"\n收到 {chunk_count} 个 chunks")
        if len(intervals) > 1:
            avg = sum(intervals[1:]) / len(intervals[1:])
            print(f"平均间隔: {avg:.3f}s")
            if avg < 0.005:
                print("⚠️ ASGI 层存在缓冲")
            else:
                print("✅ ASGI 层流式正常")

if __name__ == "__main__":
    asyncio.run(test_sse())
