import api from './api'
import type { ChatSession, Message, StreamChunk } from '../types'

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
    const token = localStorage.getItem('token')
    
    const response = await fetch('/api/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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
            onChunk(data)
          } catch {
            // 忽略解析错误
          }
        }
      }
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
    const token = localStorage.getItem('token')
    
    const response = await fetch(`/api/chat/sessions/${sessionId}/regenerate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
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

  // 导出为 Word 文档
  async exportToDocx(content: string, filename: string = 'export'): Promise<void> {
    const token = localStorage.getItem('token')
    
    const response = await fetch('/api/chat/export/docx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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
