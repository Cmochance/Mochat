/**
 * AI 图像生成 Hook
 * 支持流式 thinking 输出
 */
import { useState, useCallback, useRef } from 'react'
import type { GenerateOptions, GenerateResult, PicgenConfig, StreamChunk, GenerateResultData } from './types'

const DEFAULT_CONFIG = {
  apiBasePath: '/api/chat/image',
} satisfies PicgenConfig

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function buildGenerateUrl(apiBasePath: string, stream: boolean): string {
  const normalized = apiBasePath.endsWith('/')
    ? apiBasePath.slice(0, -1)
    : apiBasePath

  // 兼容旧微服务直连路径（/picgen）与新网关路径（/api/chat/image）
  if (normalized.startsWith('/api/chat/')) {
    return `${normalized}/generate${stream ? '/stream' : ''}`
  }
  return `${normalized}/api/generate${stream ? '/stream' : ''}`
}

export function useImageGenerate(config?: PicgenConfig) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const apiBasePath = mergedConfig.apiBasePath ?? DEFAULT_CONFIG.apiBasePath
  
  const [isGenerating, setIsGenerating] = useState(false)
  const [thinking, setThinking] = useState('')  // thinking 内容
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateResult | null>(null)
  
  // 用于取消生成
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * 流式生成图像（推荐，支持 thinking 输出）
   */
  const generate = useCallback(async (
    options: GenerateOptions,
    onThinking?: (content: string) => void  // 可选的 thinking 回调
  ): Promise<GenerateResult> => {
    // 重置状态
    setIsGenerating(true)
    setThinking('')
    setError(null)
    setResult(null)
    
    // 创建 AbortController
    abortControllerRef.current = new AbortController()

    const token = localStorage.getItem('token')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': generateRequestId(),
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await fetch(buildGenerateUrl(apiBasePath, true), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: options.prompt,
          size: options.size || '1024x1024',
          quality: options.quality || 'standard',
          user_id: options.userId || 'anonymous',
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error('请求失败')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('无法读取响应流')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let thinkingContent = ''
      let finalResult: GenerateResult = { success: false }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const chunk: StreamChunk = JSON.parse(line.slice(6))
              
              if (chunk.type === 'thinking' && typeof chunk.data === 'string') {
                thinkingContent += chunk.data
                setThinking(thinkingContent)
                onThinking?.(chunk.data)
              } else if (chunk.type === 'content' && chunk.data) {
                const data = chunk.data as GenerateResultData
                finalResult = {
                  success: data.success,
                  imageUrl: data.image_url,
                  englishPrompt: data.english_prompt,
                }
                setResult(finalResult)
              } else if (chunk.type === 'error' && typeof chunk.data === 'string') {
                finalResult = { success: false, error: chunk.data }
                setError(chunk.data)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      return finalResult

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, error: '已取消' }
      }
      const errorMsg = err instanceof Error ? err.message : '未知错误'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }, [apiBasePath])

  /**
   * 同步生成图像（简单模式，无 thinking 输出）
   */
  const generateSync = useCallback(async (options: GenerateOptions): Promise<GenerateResult> => {
    setIsGenerating(true)
    setThinking('')
    setError(null)
    setResult(null)

    const token = localStorage.getItem('token')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': generateRequestId(),
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const res = await fetch(buildGenerateUrl(apiBasePath, false), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: options.prompt,
          size: options.size || '1024x1024',
          quality: options.quality || 'standard',
          user_id: options.userId || 'anonymous',
        }),
      })

      if (!res.ok) {
        throw new Error('请求失败')
      }

      const data = await res.json()

      const finalResult: GenerateResult = {
        success: data.success,
        imageUrl: data.image_url,
        englishPrompt: data.english_prompt,
        error: data.error,
      }

      if (data.success) {
        setResult(finalResult)
      } else {
        setError(data.error || '生成失败')
      }

      return finalResult

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    } finally {
      setIsGenerating(false)
    }
  }, [apiBasePath])

  /**
   * 取消当前生成
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    setIsGenerating(false)
    setThinking('')
    setError(null)
    setResult(null)
  }, [])

  return {
    // 状态
    isGenerating,
    thinking,
    error,
    result,
    // 方法
    generate,      // 流式生成（推荐）
    generateSync,  // 同步生成
    cancel,
    reset,
  }
}
