/**
 * PPT 生成 React Hook
 */
import { useState, useCallback } from 'react';
import type {
  PPTGenerateRequest,
  PPTGenerateResult,
  PPTGenerateStreamChunk,
  UsePPTGenerateConfig,
  UsePPTGenerateReturn,
} from './types';

export function usePPTGenerate(config: UsePPTGenerateConfig = {}): UsePPTGenerateReturn {
  const { apiBase = '/api/chat/ppt', userId = 'anonymous' } = config;
  const [isGenerating, setIsGenerating] = useState(false);

  const generateRequestId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    return `ppt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  const buildGenerateUrl = (stream: boolean) => {
    const normalized = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
    if (normalized.startsWith('/api/chat/')) {
      return `${normalized}/generate${stream ? '/stream' : ''}`
    }
    return `${normalized}/api/generate${stream ? '/stream' : ''}`
  }

  const reset = useCallback(() => {
    setIsGenerating(false);
  }, []);

  const generatePPT = useCallback(
    async (
      request: PPTGenerateRequest,
      onThinking?: (chunk: string) => void
    ): Promise<PPTGenerateResult> => {
      setIsGenerating(true);

      try {
        const token = localStorage.getItem('token')
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Request-ID': generateRequestId(),
        }
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }

        const response = await fetch(buildGenerateUrl(true), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt: request.prompt,
            user_id: request.userId || userId,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('无法读取响应流');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let result: PPTGenerateResult = { success: false, error: '未收到完成信号' };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const chunk: PPTGenerateStreamChunk = JSON.parse(line.slice(6));

                switch (chunk.type) {
                  case 'thinking':
                    if (onThinking && typeof chunk.data === 'string') {
                      onThinking(chunk.data);
                    }
                    break;

                  case 'content':
                    if (typeof chunk.data === 'object') {
                      result = chunk.data as PPTGenerateResult;
                    }
                    break;

                  case 'error':
                    result = {
                      success: false,
                      error: typeof chunk.data === 'string' ? chunk.data : 'Unknown error',
                    };
                    break;

                  case 'done':
                    // 完成，返回结果
                    break;
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }

        // 处理剩余的 buffer
        if (buffer.startsWith('data: ')) {
          try {
            const chunk: PPTGenerateStreamChunk = JSON.parse(buffer.slice(6));
            if (chunk.type === 'content' && typeof chunk.data === 'object') {
              result = chunk.data as PPTGenerateResult;
            }
          } catch {
            // 忽略
          }
        }

        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'PPT 生成失败',
        };
      } finally {
        setIsGenerating(false);
      }
    },
    [apiBase, userId]
  );

  return {
    generatePPT,
    isGenerating,
    reset,
  };
}
