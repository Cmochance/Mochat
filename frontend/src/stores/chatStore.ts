import { create } from 'zustand'
import type { ChatSession, Message } from '../types'

interface ChatState {
  sessions: ChatSession[]
  currentSession: ChatSession | null
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  
  // Actions
  setSessions: (sessions: ChatSession[]) => void
  addSession: (session: ChatSession) => void
  removeSession: (sessionId: number) => void
  setCurrentSession: (session: ChatSession | null) => void
  setMessages: (messages: Message[]) => void
  prependMessages: (messages: Message[]) => void  // 在列表前面添加消息
  addMessage: (message: Message) => void
  setLoading: (loading: boolean) => void
  setStreaming: (streaming: boolean) => void
  appendStreamingContent: (content: string) => void
  appendStreamingThinking: (thinking: string) => void
  clearStreaming: () => void  // 只清空内容
  endStreaming: () => void    // 完全结束（清空内容 + isStreaming=false）
  finalizeStreaming: (thinking: string, content: string) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamingContent: '',
  streamingThinking: '',

  setSessions: (sessions) => set({ sessions }),
  
  addSession: (session) => set((state) => ({
    sessions: [session, ...state.sessions],
  })),
  
  removeSession: (sessionId) => set((state) => ({
    sessions: state.sessions.filter((s) => s.id !== sessionId),
    currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
  })),
  
  setCurrentSession: (session) => set({ currentSession: session }),
  
  setMessages: (messages) => set({ messages }),
  
  prependMessages: (newMessages) => set((state) => ({
    messages: [...newMessages, ...state.messages],
  })),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  
  appendStreamingContent: (content) => set((state) => ({
    streamingContent: state.streamingContent + content,
  })),
  
  appendStreamingThinking: (thinking) => set((state) => ({
    streamingThinking: state.streamingThinking + thinking,
  })),
  
  // 只清空流式内容，不改变 isStreaming 状态
  clearStreaming: () => set({
    streamingContent: '',
    streamingThinking: '',
  }),
  
  // 完全结束流式状态（包括 isStreaming）
  endStreaming: () => set({
    streamingContent: '',
    streamingThinking: '',
    isStreaming: false,
  }),
  
  finalizeStreaming: (thinking, content) => {
    const state = get()
    const newMessage: Message = {
      id: Date.now(),
      role: 'assistant',
      content: content || state.streamingContent,
      thinking: thinking || state.streamingThinking || undefined,
      created_at: new Date().toISOString(),
    }
    set((state) => ({
      messages: [...state.messages, newMessage],
      streamingContent: '',
      streamingThinking: '',
      isStreaming: false,
    }))
  },
}))
