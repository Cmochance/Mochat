import { create } from 'zustand'
import type { LearningMaterial, StudySession, StudyMessage } from '../types'

let _tempIdCounter = 0

interface LearnState {
  // 资料
  materials: LearningMaterial[]
  currentMaterial: LearningMaterial | null

  // 会话
  sessions: StudySession[]
  currentSession: StudySession | null

  // 消息
  messages: StudyMessage[]

  // 状态
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string

  // 资料 Actions
  setMaterials: (materials: LearningMaterial[]) => void
  addMaterial: (material: LearningMaterial) => void
  removeMaterial: (id: number) => void
  setCurrentMaterial: (material: LearningMaterial | null) => void
  updateMaterialSummary: (id: number, summary: string) => void

  // 会话 Actions
  setSessions: (sessions: StudySession[]) => void
  addSession: (session: StudySession) => void
  removeSession: (id: number) => void
  setCurrentSession: (session: StudySession | null) => void

  // 消息 Actions
  setMessages: (messages: StudyMessage[]) => void
  addMessage: (message: StudyMessage) => void

  // 流式 Actions
  setLoading: (loading: boolean) => void
  setStreaming: (streaming: boolean) => void
  appendStreamingContent: (content: string) => void
  appendStreamingThinking: (thinking: string) => void
  clearStreaming: () => void
  endStreaming: () => void
  finalizeStreaming: (thinking: string, content: string) => void
}

export const useLearnStore = create<LearnState>((set, get) => ({
  materials: [],
  currentMaterial: null,
  sessions: [],
  currentSession: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamingContent: '',
  streamingThinking: '',

  // 资料
  setMaterials: (materials) => set({ materials }),
  addMaterial: (material) => set((s) => ({ materials: [material, ...s.materials] })),
  removeMaterial: (id) => set((s) => ({
    materials: s.materials.filter((m) => m.id !== id),
    currentMaterial: s.currentMaterial?.id === id ? null : s.currentMaterial,
  })),
  setCurrentMaterial: (material) => set({ currentMaterial: material }),
  updateMaterialSummary: (id, summary) => set((s) => ({
    materials: s.materials.map((m) => m.id === id ? { ...m, summary } : m),
    currentMaterial: s.currentMaterial?.id === id ? { ...s.currentMaterial, summary } : s.currentMaterial,
  })),

  // 会话
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  removeSession: (id) => set((s) => ({
    sessions: s.sessions.filter((ss) => ss.id !== id),
    currentSession: s.currentSession?.id === id ? null : s.currentSession,
  })),
  setCurrentSession: (session) => set({ currentSession: session }),

  // 消息
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  // 流式
  setLoading: (loading) => set({ isLoading: loading }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  appendStreamingContent: (content) => set((s) => ({
    streamingContent: s.streamingContent + content,
  })),
  appendStreamingThinking: (thinking) => set((s) => ({
    streamingThinking: s.streamingThinking + thinking,
  })),
  clearStreaming: () => set({ streamingContent: '', streamingThinking: '' }),
  endStreaming: () => set({ streamingContent: '', streamingThinking: '', isStreaming: false }),
  finalizeStreaming: (thinking, content) => {
    const state = get()
    const newMessage: StudyMessage = {
      id: --_tempIdCounter,
      role: 'assistant',
      content: content || state.streamingContent,
      thinking: thinking || state.streamingThinking || undefined,
      created_at: new Date().toISOString(),
    }
    set((s) => ({
      messages: [...s.messages, newMessage],
      streamingContent: '',
      streamingThinking: '',
      isStreaming: false,
    }))
  },
}))
