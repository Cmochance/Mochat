import api from './api'
import type { ChatSession, Message, StreamChunk } from '../types'

export const chatService = {
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

  // 获取会话消息
  async getMessages(sessionId: number): Promise<Message[]> {
    const response = await api.get<Message[]>(`/chat/sessions/${sessionId}/messages`)
    return response.data
  },

  // 发送消息（流式）
  async sendMessage(
    sessionId: number,
    content: string,
    onChunk: (chunk: StreamChunk) => void
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
      }),
    })

    if (!response.ok) {
      throw new Error('发送消息失败')
    }

    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n')

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

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n')

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
  },
}
