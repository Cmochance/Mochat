"""
测试流式输出是否正常工作
直接连接后端，绕过 Vite 代理

使用方法:
    python test_stream.py <token>
    
获取 token:
    从浏览器 DevTools -> Application -> Local Storage -> token
"""
import asyncio
import httpx
import time
import sys

async def test_stream(token: str):
    """测试后端流式输出"""
    
    async with httpx.AsyncClient(base_url="http://localhost:9527") as client:
        headers = {"Authorization": f"Bearer {token}"}
        
        # 获取会话列表
        resp = await client.get("/api/chat/sessions", headers=headers)
        if resp.status_code != 200:
            print(f"获取会话失败: {resp.text}")
            return
            
        sessions = resp.json()
        
        if not sessions:
            # 创建一个新会话
            resp = await client.post("/api/chat/sessions", json={"title": "流式测试"}, headers=headers)
            session_id = resp.json()["id"]
            print(f"创建新会话: {session_id}")
        else:
            session_id = sessions[0]["id"]
            print(f"使用现有会话: {session_id}")
        
        # 测试流式输出
        print("\n--- 开始测试流式输出 (直连后端，绕过 Vite 代理) ---")
        print("观察下面的输出是逐个出现还是一次性出现:\n")
        
        chunk_count = 0
        start_time = time.time()
        last_chunk_time = start_time
        intervals = []
        
        async with client.stream(
            "POST",
            "/api/chat/completions",
            json={"session_id": session_id, "content": "用20个字描述春天"},
            headers=headers,
            timeout=60.0
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    chunk_count += 1
                    current_time = time.time()
                    interval = current_time - last_chunk_time
                    intervals.append(interval)
                    last_chunk_time = current_time
                    
                    elapsed = current_time - start_time
                    print(f"[{elapsed:.2f}s] (+{interval:.3f}s) Chunk #{chunk_count}")
        
        total_time = time.time() - start_time
        print(f"\n--- 测试完成 ---")
        print(f"总共收到 {chunk_count} 个 chunks")
        print(f"总耗时: {total_time:.2f}s")
        
        if len(intervals) > 1:
            avg_interval = sum(intervals[1:]) / len(intervals[1:])  # 排除第一个
            print(f"平均间隔: {avg_interval:.3f}s")
            
            if avg_interval < 0.005:
                print("\n⚠️ 结论: 数据是一次性到达的（后端存在缓冲）")
            else:
                print("\n✅ 结论: 数据是分批到达的（后端流式正常）")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python test_stream.py <token>")
        print("\n获取 token 方法:")
        print("  1. 打开浏览器 DevTools (F12)")
        print("  2. Application -> Local Storage -> http://localhost:3721")
        print("  3. 复制 'token' 的值")
        sys.exit(1)
    
    token = sys.argv[1]
    asyncio.run(test_stream(token))
