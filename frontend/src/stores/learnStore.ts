import { create } from 'zustand'
import type { LearningMaterial, LearningMaterialDetail, StudySession, StudyMessage, Flashcard, StudyQuiz, QuizDetail, MindmapNode, ConceptGraphData, EvaluationReport, QuizQuestion, MaterialAnnotation } from '../types'

let _tempIdCounter = 0

interface LearnState {
  // 资料
  materials: LearningMaterial[]
  currentMaterial: LearningMaterialDetail | null

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

  // 知识图谱/思维导图
  mindmap: MindmapNode | null
  conceptGraph: ConceptGraphData | null
  mapLoading: boolean

  // 学习评估与错题集
  wrongQuestions: QuizQuestion[]
  evaluationReport: EvaluationReport | null
  evaluationLoading: boolean

  // 划词与批注
  annotations: MaterialAnnotation[]

  // 状态
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string

  // 资料 Actions
  setMaterials: (materials: LearningMaterial[]) => void
  addMaterial: (material: LearningMaterial) => void
  removeMaterial: (id: number) => void
  setCurrentMaterial: (material: LearningMaterialDetail | null) => void
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

  // 评估与错题 Actions
  setWrongQuestions: (questions: QuizQuestion[]) => void
  setEvaluationReport: (report: EvaluationReport | null) => void
  setEvaluationLoading: (loading: boolean) => void

  // 批注 Actions
  setAnnotations: (annotations: MaterialAnnotation[]) => void
  addAnnotation: (annotation: MaterialAnnotation) => void
  removeAnnotation: (id: number) => void

  // 导图 / 图谱 Actions
  setMindmap: (node: MindmapNode | null) => void
  setConceptGraph: (graph: ConceptGraphData | null) => void
  setMapLoading: (loading: boolean) => void
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
  mindmap: null,
  conceptGraph: null,
  mapLoading: false,
  wrongQuestions: [],
  evaluationReport: null,
  evaluationLoading: false,
  annotations: [],
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

  // 评估与错题
  setWrongQuestions: (questions) => set({ wrongQuestions: questions }),
  setEvaluationReport: (report) => set({ evaluationReport: report }),
  setEvaluationLoading: (loading) => set({ evaluationLoading: loading }),

  // 批注
  setAnnotations: (annotations) => set({ annotations }),
  addAnnotation: (annotation) => set((s) => ({ annotations: [...s.annotations, annotation] })),
  removeAnnotation: (id) => set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),

  // 导图 / 图谱
  setMindmap: (node) => set({ mindmap: node }),
  setConceptGraph: (graph) => set({ conceptGraph: graph }),
  setMapLoading: (loading) => set({ mapLoading: loading }),
}))
