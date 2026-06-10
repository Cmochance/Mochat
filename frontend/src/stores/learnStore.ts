import { create } from 'zustand'
import type { LearningMaterial, StudySession, StudyMessage, Flashcard, StudyQuiz, QuizQuestion, QuizDetail } from '../types'

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

  // 闪卡
  flashcards: Flashcard[]
  flashcardLoading: boolean
  currentCardIndex: number
  isFlipped: boolean
  flashcardMode: 'all' | 'due'

  // 测验
  quizzes: StudyQuiz[]
  currentQuizDetail: QuizDetail | null
  quizLoading: boolean

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

  // 闪卡 Actions
  setFlashcards: (cards: Flashcard[]) => void
  setFlashcardLoading: (loading: boolean) => void
  setCurrentCardIndex: (index: number) => void
  setIsFlipped: (flipped: boolean) => void
  updateFlashcardStatus: (id: number, status: string) => void
  setFlashcardMode: (mode: 'all' | 'due') => void

  // 测验 Actions
  setQuizzes: (quizzes: StudyQuiz[]) => void
  addQuiz: (quiz: StudyQuiz) => void
  setCurrentQuizDetail: (detail: QuizDetail | null) => void
  setQuizLoading: (loading: boolean) => void
  submitQuestionAnswer: (questionId: number, answer: string) => void
}

export const useLearnStore = create<LearnState>((set, get) => ({
  materials: [],
  currentMaterial: null,
  sessions: [],
  currentSession: null,
  messages: [],
  flashcards: [],
  flashcardLoading: false,
  currentCardIndex: 0,
  isFlipped: false,
  flashcardMode: 'due',
  quizzes: [],
  currentQuizDetail: null,
  quizLoading: false,
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

  // 闪卡
  setFlashcards: (cards) => set({ flashcards: cards, currentCardIndex: 0, isFlipped: false }),
  setFlashcardLoading: (loading) => set({ flashcardLoading: loading }),
  setCurrentCardIndex: (index) => set({ currentCardIndex: index, isFlipped: false }),
  setIsFlipped: (flipped) => set({ isFlipped: flipped }),
  updateFlashcardStatus: (id, status) => set((s) => ({
    flashcards: s.flashcards.map((c) =>
      c.id === id ? { ...c, status: status as Flashcard['status'], review_count: c.review_count + 1 } : c
    ),
  })),
  setFlashcardMode: (mode) => set({ flashcardMode: mode }),

  // 测验
  setQuizzes: (quizzes) => set({ quizzes }),
  addQuiz: (quiz) => set((s) => ({ quizzes: [quiz, ...s.quizzes] })),
  setCurrentQuizDetail: (detail) => set({ currentQuizDetail: detail }),
  setQuizLoading: (loading) => set({ quizLoading: loading }),
  submitQuestionAnswer: (questionId, answer) => set((s) => {
    if (!s.currentQuizDetail) return {}
    return {
      currentQuizDetail: {
        ...s.currentQuizDetail,
        questions: s.currentQuizDetail.questions.map((q) =>
          q.id === questionId ? { ...q, user_answer: answer } : q
        ),
      },
    }
  }),
}))
