import api from './api'
import type {
  LearningMaterial,
  LearningMaterialDetail,
  StudySession,
  StudyMessage,
  Flashcard,
  StudyQuiz,
  QuizQuestion,
  EvaluationReport,
  MaterialAnnotation,
} from '../types'
import { getApiBaseUrl } from '../utils/env'

const apiUrl = (path: string): string => {
  const base = getApiBaseUrl()
  if (base.startsWith('http')) {
    const origin = new URL(base).origin
    return `${origin}${path}`
  }
  return path
}

// ---- 知识库 (Knowledge) ----

async function uploadKnowledgeDocument(file: File): Promise<any> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/knowledge/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
  return res.data
}

async function getKnowledgeGraph(): Promise<any> {
  const res = await api.get('/knowledge/graph')
  return res.data
}

// ---- 资料 ----

async function uploadMaterial(file: File): Promise<LearningMaterial> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/learn/materials/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
  return res.data
}

async function createTextMaterial(title: string, content: string): Promise<LearningMaterial> {
  const res = await api.post('/learn/materials/text', { title, content })
  return res.data
}

async function getMaterials(): Promise<{ materials: LearningMaterial[]; total: number }> {
  const res = await api.get('/learn/materials')
  return res.data
}

async function getMaterial(id: number): Promise<LearningMaterialDetail> {
  const res = await api.get(`/learn/materials/${id}`)
  return res.data
}

async function deleteMaterial(id: number): Promise<void> {
  await api.delete(`/learn/materials/${id}`)
}

async function generateSummary(id: number): Promise<{ summary: string }> {
  const res = await api.post(`/learn/materials/${id}/summary`)
  return res.data
}

// ---- 学习会话 ----

async function createSession(materialId: number, title?: string): Promise<StudySession> {
  const res = await api.post('/learn/sessions', {
    material_id: materialId,
    title: title || '学习会话',
  })
  return res.data
}

async function getSessions(materialId?: number): Promise<{ sessions: StudySession[] }> {
  const params = materialId ? { material_id: materialId } : {}
  const res = await api.get('/learn/sessions', { params })
  return res.data
}

async function deleteSession(id: number): Promise<void> {
  await api.delete(`/learn/sessions/${id}`)
}

// ---- 学习消息 ----

async function getMessages(sessionId: number): Promise<{ messages: StudyMessage[] }> {
  const res = await api.get(`/learn/sessions/${sessionId}/messages`)
  return res.data
}

async function sendMessageStream(
  sessionId: number,
  content: string,
  model: string | undefined,
  highlightContext: string | undefined,
  onChunk: (chunk: { type: string; data: string }) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem('token')
  const response = await fetch(apiUrl(`/api/learn/sessions/${sessionId}/messages`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content, model, highlight_context: highlightContext }),
    signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: '请求失败' }))
    throw new Error(errorData.detail || '请求失败')
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data: ')) {
        try {
          const chunk = JSON.parse(trimmed.slice(6))
          onChunk(chunk)
        } catch {
          // 忽略解析错误
        }
      }
    }
  }
}

// ---- 闪卡 ----

async function generateFlashcards(materialId: number): Promise<{ flashcards: Flashcard[]; total: number }> {
  const res = await api.post(`/learn/materials/${materialId}/flashcards`)
  return res.data
}

async function getFlashcards(materialId: number, dueOnly: boolean = false): Promise<{ flashcards: Flashcard[]; total: number }> {
  const path = dueOnly 
    ? `/learn/materials/${materialId}/flashcards/due`
    : `/learn/materials/${materialId}/flashcards`
  const res = await api.get(path)
  return res.data
}

async function updateFlashcardStatus(cardId: number, status: string): Promise<Flashcard> {
  const res = await api.patch(`/learn/flashcards/${cardId}/status`, { status })
  return res.data
}

// ---- 测验 ----

async function generateQuiz(materialId: number): Promise<any> {
  const res = await api.post(`/learn/materials/${materialId}/quizzes`)
  return res.data
}

async function getQuizzes(materialId?: number): Promise<any> {
  const params = materialId ? { material_id: materialId } : {}
  const res = await api.get('/learn/quizzes', { params })
  return res.data
}

async function getQuizDetail(quizId: number): Promise<any> {
  const res = await api.get(`/learn/quizzes/${quizId}`)
  return res.data
}

async function submitQuiz(quizId: number, answers: { question_id: number; user_answer: string }[]): Promise<any> {
  const res = await api.post(`/learn/quizzes/${quizId}/submit`, { answers })
  return res.data
}

async function generateMap(materialId: number, mapType: 'mindmap' | 'concept_graph'): Promise<any> {
  const res = await api.post(`/learn/materials/${materialId}/maps`, null, { params: { map_type: mapType } })
  return res.data
}

async function getMap(materialId: number, mapType: 'mindmap' | 'concept_graph'): Promise<any> {
  const res = await api.get(`/learn/materials/${materialId}/maps`, { params: { map_type: mapType } })
  return res.data
}

async function getWrongQuestions(materialId: number): Promise<{ wrong_questions: QuizQuestion[] }> {
  const res = await api.get(`/learn/materials/${materialId}/wrong-questions`)
  return res.data
}

async function getEvaluationReport(materialId: number): Promise<EvaluationReport> {
  const res = await api.get(`/learn/materials/${materialId}/evaluation`)
  return res.data
}

async function generateAdaptiveQuiz(materialId: number): Promise<StudyQuiz> {
  const res = await api.post(`/learn/materials/${materialId}/adaptive-quiz`)
  return res.data
}

async function getAnnotations(materialId: number): Promise<{ annotations: MaterialAnnotation[] }> {
  const res = await api.get(`/learn/materials/${materialId}/annotations`)
  return res.data
}

async function createAnnotation(
  materialId: number,
  selectedText: string,
  note?: string,
  color?: string,
  startOffset?: number | null,
  endOffset?: number | null,
): Promise<MaterialAnnotation> {
  const res = await api.post(`/learn/materials/${materialId}/annotations`, {
    selected_text: selectedText,
    note,
    color,
    start_offset: startOffset,
    end_offset: endOffset,
  })
  return res.data
}

async function deleteAnnotation(annotationId: number): Promise<{ success: boolean }> {
  const res = await api.delete(`/learn/annotations/${annotationId}`)
  return res.data
}


// ---- 有声书/播客 ----

async function generateSummaryAudio(materialId: number): Promise<Blob> {
  const res = await api.post(`/learn/materials/${materialId}/audio/summary`, {}, {
    responseType: 'blob',
    timeout: 120000,
  })
  return res.data
}

async function generatePodcastAudio(materialId: number): Promise<Blob> {
  const res = await api.post(`/learn/materials/${materialId}/audio/podcast`, {}, {
    responseType: 'blob',
    timeout: 180000,
  })
  return res.data
}

async function generatePodcastScript(materialId: number): Promise<{ script: { speaker: string; text: string }[] }> {
  const res = await api.post(`/learn/materials/${materialId}/audio/podcast/script`)
  return res.data
}

export const learnService = {
  uploadKnowledgeDocument,
  getKnowledgeGraph,
  uploadMaterial,
  createTextMaterial,
  getMaterials,
  getMaterial,
  deleteMaterial,
  generateSummary,
  createSession,
  getSessions,
  deleteSession,
  getMessages,
  sendMessageStream,
  generateFlashcards,
  getFlashcards,
  updateFlashcardStatus,
  generateQuiz,
  getQuizzes,
  getQuizDetail,
  submitQuiz,
  generateMap,
  getMap,
  getWrongQuestions,
  getEvaluationReport,
  generateAdaptiveQuiz,
  getAnnotations,
  createAnnotation,
  deleteAnnotation,
  generateSummaryAudio,
  generatePodcastAudio,
  generatePodcastScript,
}
