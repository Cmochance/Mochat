import api from './api'
import type { ChatSession, Message, StreamChunk } from '../types'

const generateRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const clearAuthAndRedirect = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  localStorage.removeItem('auth-storage')
  if (window.location.pathname !== '/auth/login') {
    window.location.href = '/auth/login'
  }
}

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return null

  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) return null

  const data = await response.json() as {
    access_token?: string
    refresh_token?: string | null
  }
  if (!data.access_token) return null

  localStorage.setItem('token', data.access_token)
  if (data.refresh_token) {
    localStorage.setItem('refresh_token', data.refresh_token)
  }
  return data.access_token
}

const fetchWithAuthRetry = async (
  url: string,
  init: RequestInit,
  retried: boolean = false
): Promise<Response> => {
  const token = localStorage.getItem('token')
  const headers = new Headers(init.headers || {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, { ...init, headers })
  if (response.status !== 401 || retried) {
    if (response.status === 401 && retried) {
      clearAuthAndRedirect()
    }
    return response
  }

  const nextToken = await refreshAccessToken()
  if (!nextToken) {
    clearAuthAndRedirect()
    return response
  }

  const retryHeaders = new Headers(init.headers || {})
  retryHeaders.set('Authorization', `Bearer ${nextToken}`)
  return fetch(url, { ...init, headers: retryHeaders })
}

// 分页消息响应
interface MessagesPaginatedResponse {
  messages: Message[]
  has_more: boolean
  total: number
}

// 模型信息
export interface ModelInfo {
  id: string
  name: string
  owned_by?: string | null
}

// 模型列表响应
interface ModelsResponse {
  models: ModelInfo[]
  default_model: string
}

export const chatService = {
  // 获取可用模型列表
  async getModels(): Promise<ModelsResponse> {
    const response = await api.get<ModelsResponse>('/chat/models')
    return response.data
  },

  // 获取会话列表
  async getSessions(): Promise<ChatSession[]> {
    const response = await api.get<ChatSession[]>('/chat/sessions')
    return response.data
  },

  // 创建会话
  async createSession(title: string = '新对话'): Promise<ChatSession> {
    const response = await api.post<ChatSession>('/chat/sessions', { title })
    return response.data
  },

  // 获取会话详情
  async getSession(sessionId: number): Promise<ChatSession> {
    const response = await api.get<ChatSession>(`/chat/sessions/${sessionId}`)
    return response.data
  },

  // 删除会话
  async deleteSession(sessionId: number): Promise<void> {
    await api.delete(`/chat/sessions/${sessionId}`)
  },

  // 获取会话消息（分页）
  async getMessages(
    sessionId: number,
    limit: number = 10,
    beforeId?: number
  ): Promise<MessagesPaginatedResponse> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (beforeId) {
      params.append('before_id', String(beforeId))
    }
    const response = await api.get<MessagesPaginatedResponse>(
      `/chat/sessions/${sessionId}/messages?${params.toString()}`
    )
    return response.data
  },

  // 发送消息（流式）
  async sendMessage(
    sessionId: number,
    content: string,
    onChunk: (chunk: StreamChunk) => void,
    model?: string
  ): Promise<void> {
    const response = await fetchWithAuthRetry('/api/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': generateRequestId(),
      },
      body: JSON.stringify({
        session_id: sessionId,
        content,
        model: model || undefined,
      }),
    })

    if (!response.ok) {
      throw new Error('发送消息失败')
    }

    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''
    let chunkCount = 0

    console.log('[Stream] 开始接收流式数据...')

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log(`[Stream] 流式传输完成，共收到 ${chunkCount} 个数据块`)
        break
      }

      // 调试日志：确认收到数据
      chunkCount++
      console.log(`[Stream] 收到数据块 #${chunkCount}: ${value?.length || 0} bytes`)

      // 使用 stream: true 处理多字节字符
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      
      // 保留最后一个可能不完整的行
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as StreamChunk
            // 立即调用回调，让 React 处理更新
            onChunk(data)
          } catch {
            // 忽略解析错误
          }
        }
      }
      
      // 给浏览器一个渲染的机会
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // 处理剩余的 buffer
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6)) as StreamChunk
        onChunk(data)
      } catch {
        // 忽略
      }
    }
  },

  // 重新生成响应
  async regenerateResponse(
    sessionId: number,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const response = await fetchWithAuthRetry(`/api/chat/sessions/${sessionId}/regenerate`, {
      method: 'POST',
      headers: {
        'X-Request-ID': generateRequestId(),
      },
    })

    if (!response.ok) {
      throw new Error('重新生成失败')
    }

    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''
    let chunkCount = 0

    console.log('[Stream/Regenerate] 开始接收流式数据...')

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log(`[Stream/Regenerate] 流式传输完成，共收到 ${chunkCount} 个数据块`)
        break
      }

      // 调试日志
      chunkCount++
      console.log(`[Stream/Regenerate] 收到数据块 #${chunkCount}: ${value?.length || 0} bytes`)

      // 使用 stream: true 处理多字节字符
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      
      // 保留最后一个可能不完整的行
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as StreamChunk
            onChunk(data)
          } catch {
            // 忽略解析错误
          }
        }
      }
      
      // 给浏览器一个渲染的机会
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // 处理剩余的 buffer
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6)) as StreamChunk
        onChunk(data)
      } catch {
        // 忽略
      }
    }
  },

  // 保存消息到数据库（用于绘图、PPT等非AI对话生成的消息）
  async saveMessage(
    sessionId: number,
    role: 'user' | 'assistant',
    content: string,
    thinking?: string
  ): Promise<void> {
    await api.post('/chat/messages', {
      session_id: sessionId,
      role,
      content,
      thinking,
    })
  },

  // 导出为 Word 文档
  async exportToDocx(content: string, filename: string = 'export'): Promise<void> {
    const response = await fetchWithAuthRetry('/api/chat/export/docx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content, filename }),
    })

    if (!response.ok) {
      throw new Error('导出失败')
    }

    // 下载文件 - 直接使用前端传入的文件名
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.docx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  },
}
