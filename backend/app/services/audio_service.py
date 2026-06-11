"""
有声书/播客生成服务
- 摘要朗读：AI 生成摘要 → edge-tts 转语音
- 双人播客：AI 生成对话脚本 → edge-tts 多语音合成 → 拼接
"""
import asyncio
import io
import logging
import os
import re
import tempfile
from typing import AsyncGenerator, Dict, List, Optional, Tuple

from .ai_service import ai_service

logger = logging.getLogger(__name__)

# 中文语音列表（edge-tts 支持的高质量中文语音）
VOICE_PROFILES = {
    "narrator": "zh-CN-YunxiNeural",       # 旁白：沉稳男声
    "host_a": "zh-CN-XiaoxiaoNeural",      # 主持人 A：活泼女声
    "host_b": "zh-CN-YunjianNeural",        # 主持人 B：稳重男声
    "host_c": "zh-CN-XiaoyiNeural",         # 备选：温和女声
}

# 播客对话脚本生成 Prompt
PODCAST_SCRIPT_PROMPT = """你是一位专业的播客编剧。请根据以下学习资料，编写一段 2 位主持人之间的播客对话脚本。

要求：
1. 主持人 A（女，活泼好奇）和主持人 B（男，博学耐心）围绕资料内容展开自然对话
2. 对话应覆盖资料的核心知识点，以通俗易懂的方式讲解
3. 适当加入提问、类比、举例，让听众更容易理解
4. 对话 8-15 轮，每轮每人说 1-3 句话
5. 开头要有简短的引入（"欢迎收听..."），结尾要有总结
6. 用中文撰写
7. 严格按以下格式返回，每行一条，不要包含其他内容：

[A]主持人A说的话
[B]主持人B说的话
[A]主持人A说的话
[B]主持人B说的话
...

注意：每行必须以 [A] 或 [B] 开头，后面紧跟说话内容。

---
学习资料内容：
{content}"""

# 摘要朗读脚本生成 Prompt
SUMMARY_AUDIO_PROMPT = """请为以下学习资料撰写一段适合朗读的精炼摘要。

要求：
1. 覆盖核心要点，逻辑清晰
2. 语言流畅自然，适合语音朗读（避免使用列表符号、代码块等不易朗读的格式）
3. 时长约 2-3 分钟（约 500-800 字）
4. 用中文撰写
5. 直接返回摘要文本，不要包含任何标题或标记

---
学习资料内容：
{content}"""


async def _generate_podcast_script(content: str) -> List[Tuple[str, str]]:
    """
    调用 AI 生成播客对话脚本。
    返回 [(speaker, text), ...]，speaker 为 "A" 或 "B"。
    """
    truncated = content[:15000] if len(content) > 15000 else content
    prompt = PODCAST_SCRIPT_PROMPT.format(content=truncated)

    try:
        _thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": "请生成播客对话脚本。"}],
            system_prompt=prompt,
        )
    except Exception as e:
        logger.error("生成播客脚本失败: %s", e)
        raise

    # 解析脚本
    lines = result.strip().split("\n")
    dialogue: List[Tuple[str, str]] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        match = re.match(r'\[([AB])\]\s*(.*)', line)
        if match:
            speaker = match.group(1)
            text = match.group(2).strip()
            if text:
                dialogue.append((speaker, text))

    if not dialogue:
        logger.warning("播客脚本解析失败，原始输出: %s", result[:200])
        raise ValueError("AI 生成的播客脚本格式不符合预期")

    return dialogue


async def _generate_summary_text(content: str) -> str:
    """
    调用 AI 生成适合朗读的摘要文本。
    """
    truncated = content[:15000] if len(content) > 15000 else content
    prompt = SUMMARY_AUDIO_PROMPT.format(content=truncated)

    try:
        _thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": "请生成朗读摘要。"}],
            system_prompt=prompt,
        )
        return result.strip()
    except Exception as e:
        logger.error("生成摘要文本失败: %s", e)
        raise


async def _text_to_audio(text: str, voice: str, rate: str = "+0%") -> bytes:
    """
    使用 edge-tts 将文本转为 MP3 音频。
    """
    try:
        import edge_tts
    except ImportError:
        raise ValueError("edge-tts 未安装，无法生成音频。请运行: pip install edge-tts")

    communicate = edge_tts.Communicate(text, voice, rate=rate)
    audio_data = io.BytesIO()

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.write(chunk["data"])

    return audio_data.getvalue()


async def _concat_mp3_chunks(chunks: List[bytes]) -> bytes:
    """
    简单拼接多个 MP3 数据块。
    edge-tts 输出的 MP3 可以直接二进制拼接（每个 chunk 都是完整的 MP3 frame 序列）。
    """
    result = io.BytesIO()
    for chunk in chunks:
        result.write(chunk)
    return result.getvalue()


async def generate_summary_audio(content: str) -> Tuple[bytes, str]:
    """
    生成摘要朗读音频。
    返回 (mp3_bytes, summary_text)。
    """
    summary_text = await _generate_summary_text(content)
    audio_bytes = await _text_to_audio(summary_text, VOICE_PROFILES["narrator"])
    return audio_bytes, summary_text


async def generate_podcast_audio(
    content: str,
) -> Tuple[bytes, List[Tuple[str, str]]]:
    """
    生成双人播客音频。
    返回 (mp3_bytes, dialogue_script)。
    """
    dialogue = await _generate_podcast_script(content)

    # 为每个对话片段生成音频
    audio_chunks: List[bytes] = []
    for speaker, text in dialogue:
        voice = VOICE_PROFILES["host_a"] if speaker == "A" else VOICE_PROFILES["host_b"]
        try:
            chunk = await _text_to_audio(text, voice)
            audio_chunks.append(chunk)
        except Exception as e:
            logger.warning("TTS 生成失败 (speaker=%s): %s", speaker, e)
            continue

    if not audio_chunks:
        raise ValueError("所有音频片段生成失败")

    combined = await _concat_mp3_chunks(audio_chunks)
    return combined, dialogue


async def generate_podcast_audio_stream(
    content: str,
) -> AsyncGenerator[Dict, None]:
    """
    流式生成播客音频：先返回脚本，再逐段生成音频。
    Yields:
        {"type": "script", "data": [(speaker, text), ...]}
        {"type": "audio_chunk", "speaker": "A"/"B", "data": mp3_bytes}
        {"type": "done", "data": full_mp3_bytes}
        {"type": "error", "data": error_message}
    """
    try:
        # 1. 先生成脚本
        dialogue = await _generate_podcast_script(content)
        yield {"type": "script", "data": dialogue}

        # 2. 逐段生成音频
        all_audio: List[bytes] = []
        for speaker, text in dialogue:
            voice = VOICE_PROFILES["host_a"] if speaker == "A" else VOICE_PROFILES["host_b"]
            try:
                chunk = await _text_to_audio(text, voice)
                all_audio.append(chunk)
                yield {"type": "audio_chunk", "speaker": speaker, "data": chunk}
            except Exception as e:
                logger.warning("TTS 生成失败 (speaker=%s): %s", speaker, e)
                yield {"type": "error", "data": f"TTS 生成失败: {e}"}
                return

        # 3. 拼接完成
        combined = await _concat_mp3_chunks(all_audio)
        yield {"type": "done", "data": combined}

    except Exception as e:
        logger.error("播客生成失败: %s", e)
        yield {"type": "error", "data": str(e)}
