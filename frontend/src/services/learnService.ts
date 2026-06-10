import api from './api'
import type {
  LearningMaterial,
  LearningMaterialDetail,
  StudySession,
  StudyMessage,
  Flashcard,
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
  model?: string,
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
    body: JSON.stringify({ content, model }),
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

async function getFlashcards(materialId: number): Promise<{ flashcards: Flashcard[]; total: number }> {
  const res = await api.get(`/learn/materials/${materialId}/flashcards`)
  return res.data
}

async function updateFlashcardStatus(cardId: number, status: string): Promise<Flashcard> {
  const res = await api.patch(`/learn/flashcards/${cardId}/status`, { status })
  return res.data
}

export const learnService = {
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
}
