import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Plus, ArrowLeft, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLearnStore } from '../../stores/learnStore'
import { useAuthStore } from '../../stores/authStore'
import { learnService } from '../../services/learnService'
import MaterialUpload from './components/MaterialUpload'
import MaterialList from './components/MaterialList'
import { MessageSquare, Layers, HelpCircle, Network, Award, Headphones } from 'lucide-react'
import StudyChat from './components/StudyChat'
import FlashcardView from './components/FlashcardView'
import QuizView from './components/QuizView'
import MapView from './components/MapView'
import AudioView from './components/AudioView'
import EvaluationView from './components/EvaluationView'
import ReaderView from './components/ReaderView'
import SummaryPanel from './components/SummaryPanel'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import type { LearningMaterial } from '../../types'

export default function Learn() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { isAuthenticated } = useAuthStore()

  const {
    materials,
    currentMaterial,
    currentSession,
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    streamingThinking,
    setMaterials,
    addMaterial,
    removeMaterial,
    setCurrentMaterial,
    updateMaterialSummary,
    setSessions,
    addSession,
    setCurrentSession,
    setMessages,
    addMessage,
    setLoading,
    setStreaming,
    appendStreamingContent,
    appendStreamingThinking,
    clearStreaming,
    endStreaming,
    finalizeStreaming,
  } = useLearnStore()

  const [showUpload, setShowUpload] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<'read' | 'chat' | 'flashcards' | 'quiz' | 'map' | 'evaluation' | 'audio'>('read')
  const [isUploading, setIsUploading] = useState(false)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 未登录跳转
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth/login?redirect=/learn')
    }
  }, [isAuthenticated, navigate])

  // 加载资料列表
  useEffect(() => {
    if (!isAuthenticated) return
    learnService.getMaterials().then((res) => setMaterials(res.materials)).catch(() => {})
  }, [isAuthenticated, setMaterials])

  // 选择资料后加载会话
  const handleSelectMaterial = useCallback(async (material: LearningMaterial) => {
    try {
      const detail = await learnService.getMaterial(material.id)
      setCurrentMaterial(detail)
    } catch {
      setCurrentMaterial({
        ...material,
        raw_text: '',
      })
    }
    setCurrentSession(null)
    setMessages([])
    setActiveTab('read')
    try {
      const res = await learnService.getSessions(material.id)
      setSessions(res.sessions)
      // 如果有会话，自动选择第一个
      if (res.sessions.length > 0) {
        setCurrentSession(res.sessions[0])
        const msgRes = await learnService.getMessages(res.sessions[0].id)
        setMessages(msgRes.messages)
      }
    } catch {
      setSessions([])
    }
  }, [setCurrentMaterial, setCurrentSession, setMessages, setSessions])

  // 上传文件
  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true)
    try {
      const material = await learnService.uploadMaterial(file)
      addMaterial(material)
      setShowUpload(false)
      handleSelectMaterial(material)
    } catch (err: any) {
      alert(err?.response?.data?.detail || t('learn.upload.error'))
    } finally {
      setIsUploading(false)
    }
  }, [addMaterial, handleSelectMaterial, t])

  // 粘贴文本
  const handleTextSubmit = useCallback(async (title: string, content: string) => {
    setIsUploading(true)
    try {
      const material = await learnService.createTextMaterial(title, content)
      addMaterial(material)
      setShowUpload(false)
      handleSelectMaterial(material)
    } catch (err: any) {
      alert(err?.response?.data?.detail || t('learn.upload.error'))
    } finally {
      setIsUploading(false)
    }
  }, [addMaterial, handleSelectMaterial, t])

  // 删除资料
  const handleDeleteMaterial = useCallback(async (id: number) => {
    if (!confirm(t('learn.materials.confirmDelete'))) return
    try {
      await learnService.deleteMaterial(id)
      removeMaterial(id)
      if (currentMaterial?.id === id) {
        setCurrentMaterial(null)
        setSessions([])
        setMessages([])
      }
    } catch {
      // ignore
    }
  }, [currentMaterial, removeMaterial, setCurrentMaterial, setMessages, setSessions, t])

  // 生成摘要
  const handleGenerateSummary = useCallback(async () => {
    if (!currentMaterial) return
    setIsGeneratingSummary(true)
    try {
      const res = await learnService.generateSummary(currentMaterial.id)
      updateMaterialSummary(currentMaterial.id, res.summary)
    } catch {
      // ignore
    } finally {
      setIsGeneratingSummary(false)
    }
  }, [currentMaterial, updateMaterialSummary])

  // 创建学习会话
  const handleCreateSession = useCallback(async () => {
    if (!currentMaterial) return
    try {
      const session = await learnService.createSession(currentMaterial.id)
      addSession(session)
      setCurrentSession(session)
      setMessages([])
    } catch {
      // ignore
    }
  }, [currentMaterial, addSession, setCurrentSession, setMessages])

  // 发送学习消息
  const handleSendMessage = useCallback(async (content: string) => {
    if (!currentSession) return

    // 添加用户消息到 UI
    const userMsg = {
      id: Date.now(),
      role: 'user' as const,
      content,
      created_at: new Date().toISOString(),
    }
    addMessage(userMsg)
    setLoading(true)
    setStreaming(true)
    clearStreaming()

    abortRef.current = new AbortController()

    try {
      await learnService.sendMessageStream(
        currentSession.id,
        content,
        undefined,
        undefined,
        (chunk) => {
          if (chunk.type === 'thinking') {
            appendStreamingThinking(chunk.data)
          } else if (chunk.type === 'content') {
            appendStreamingContent(chunk.data)
          } else if (chunk.type === 'done') {
            const state = useLearnStore.getState()
            finalizeStreaming(state.streamingThinking, state.streamingContent)
          }
        },
        abortRef.current.signal,
      )
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        endStreaming()
      }
    } finally {
      setLoading(false)
    }
  }, [currentSession, addMessage, setLoading, setStreaming, clearStreaming, appendStreamingThinking, appendStreamingContent, finalizeStreaming, endStreaming])

  // 划词解释
  const handleExplainInChat = useCallback(async (text: string) => {
    if (!currentMaterial) return

    let activeSession = currentSession
    if (!activeSession) {
      try {
        activeSession = await learnService.createSession(currentMaterial.id)
        addSession(activeSession)
        setCurrentSession(activeSession)
        setMessages([])
      } catch (err) {
        console.error('Failed to create session', err)
        return
      }
    }

    setActiveTab('chat')
    const prompt = t('learn.annotation.explainPrompt', '请帮我解释选中的文本内容：\n\n> {{text}}', { text })

    const userMsg = {
      id: Date.now(),
      role: 'user' as const,
      content: prompt,
      created_at: new Date().toISOString(),
    }
    addMessage(userMsg)
    setLoading(true)
    setStreaming(true)
    clearStreaming()

    abortRef.current = new AbortController()

    try {
      await learnService.sendMessageStream(
        activeSession.id,
        prompt,
        undefined,
        text,
        (chunk) => {
          if (chunk.type === 'thinking') {
            appendStreamingThinking(chunk.data)
          } else if (chunk.type === 'content') {
            appendStreamingContent(chunk.data)
          } else if (chunk.type === 'done') {
            const state = useLearnStore.getState()
            finalizeStreaming(state.streamingThinking, state.streamingContent)
          }
        },
        abortRef.current.signal,
      )
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        endStreaming()
      }
    } finally {
      setLoading(false)
    }
  }, [currentMaterial, currentSession, addSession, setCurrentSession, setMessages, setActiveTab, addMessage, setLoading, setStreaming, clearStreaming, appendStreamingThinking, appendStreamingContent, finalizeStreaming, endStreaming])

  return (
    <div className="h-screen flex flex-col bg-paper-cream">
      {/* 顶部导航 */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-paper-aged bg-paper-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="p-1.5 rounded-sm hover:bg-paper-aged transition-colors"
            title={t('learn.backToChat')}
          >
            <ArrowLeft size={18} className="text-ink-medium" />
          </button>
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-ink-black" />
            <h1 className="text-lg font-medium text-ink-black">{t('learn.title')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSummaryPanelOpen(!summaryPanelOpen)}
            className="p-1.5 rounded-sm hover:bg-paper-aged transition-colors"
            title={t('learn.toggleSummary')}
          >
            {summaryPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </header>

      {/* 主体 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：资料列表 */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-r border-paper-aged bg-paper-white flex flex-col overflow-hidden"
            >
              <div className="p-3 border-b border-paper-aged">
                <Button
                  onClick={() => setShowUpload(true)}
                  className="w-full flex items-center justify-center gap-1.5"
                >
                  <Plus size={16} />
                  {t('learn.upload.newMaterial')}
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
                <MaterialList
                  materials={materials}
                  currentId={currentMaterial?.id ?? null}
                  onSelect={handleSelectMaterial}
                  onDelete={handleDeleteMaterial}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* 中间：学习对话 */}
        <main className="flex-1 flex flex-col min-w-0">
          {currentMaterial ? (
            <>
              {/* 会话栏 */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-paper-aged bg-paper-white">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-1 rounded-sm hover:bg-paper-aged transition-colors lg:hidden"
                >
                  <BookOpen size={16} />
                </button>
                <span className="text-sm text-ink-medium truncate flex-1">
                  {currentSession?.title || currentMaterial.title}
                </span>
                <button
                  onClick={handleCreateSession}
                  className="text-xs text-ink-faint hover:text-ink-black transition-colors px-2 py-1 rounded-sm hover:bg-paper-aged"
                >
                  + {t('learn.chat.newSession')}
                </button>
              </div>
              {/* Tab 切换 */}
              <div className="flex border-b border-paper-aged bg-paper-white">
                <button
                  onClick={() => setActiveTab('read')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                    activeTab === 'read'
                      ? 'border-ink-black text-ink-black'
                      : 'border-transparent text-ink-faint hover:text-ink-medium'
                  }`}
                >
                  <BookOpen size={14} />
                  {t('learn.tabs.read')}
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                    activeTab === 'chat'
                      ? 'border-ink-black text-ink-black'
                      : 'border-transparent text-ink-faint hover:text-ink-medium'
                  }`}
                >
                  <MessageSquare size={14} />
                  {t('learn.tabs.chat')}
                </button>
                <button
                  onClick={() => setActiveTab('flashcards')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                    activeTab === 'flashcards'
                      ? 'border-ink-black text-ink-black'
                      : 'border-transparent text-ink-faint hover:text-ink-medium'
                  }`}
                >
                  <Layers size={14} />
                  {t('learn.tabs.flashcards')}
                </button>
                <button
                  onClick={() => setActiveTab('quiz')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                    activeTab === 'quiz'
                      ? 'border-ink-black text-ink-black'
                      : 'border-transparent text-ink-faint hover:text-ink-medium'
                  }`}
                >
                  <HelpCircle size={14} />
                  {t('learn.tabs.quiz')}
                </button>
               <button
                 onClick={() => setActiveTab('map')}
                 className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                   activeTab === 'map'
                     ? 'border-ink-black text-ink-black'
                     : 'border-transparent text-ink-faint hover:text-ink-medium'
                 }`}
               >
                 <Network size={14} />
                 {t('learn.tabs.map')}
               </button>
              <button
                onClick={() => setActiveTab('evaluation')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                  activeTab === 'evaluation'
                    ? 'border-ink-black text-ink-black'
                    : 'border-transparent text-ink-faint hover:text-ink-medium'
                }`}
              >
                <Award size={14} />
                {t('learn.tabs.evaluation')}
              </button>
              <button
                   onClick={() => setActiveTab('audio')}
                   className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                     activeTab === 'audio'
                       ? 'bg-ink-black text-paper-white'
                       : 'text-ink-medium hover:text-ink-black hover:bg-paper-aged'
                   }`}
                 >
                   <Headphones size={14} />
                   {t('learn.tabs.audio')}
                 </button>
              </div>
              {/* 内容区 */}
              {activeTab === 'read' ? (
                <ReaderView
                  materialId={currentMaterial.id}
                  rawText={currentMaterial.raw_text}
                  onExplainInChat={handleExplainInChat}
                />
              ) : activeTab === 'chat' ? (
                <StudyChat
                  messages={messages}
                  isStreaming={isStreaming}
                  streamingContent={streamingContent}
                  streamingThinking={streamingThinking}
                  onSend={handleSendMessage}
                  disabled={isLoading}
                />
              ) : activeTab === 'flashcards' ? (
                <FlashcardView materialId={currentMaterial.id} />
             ) : activeTab === 'quiz' ? (
               <QuizView materialId={currentMaterial.id} />
            ) : activeTab === 'map' ? (
              <MapView
                  materialId={currentMaterial.id}
                  onAskAboutConcept={(_concept) => {
                    setActiveTab('chat')
                  }}
                  onViewFlashcards={() => setActiveTab('flashcards')}
                />
            ) : activeTab === 'audio' ? (
              <AudioView materialId={currentMaterial.id} />
            ) : (
              <EvaluationView materialId={currentMaterial.id} onSwitchToTab={setActiveTab} />
            )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-ink-faint">
              <BookOpen size={48} className="mb-4 opacity-30" />
              <p className="text-lg mb-1">{t('learn.empty.title')}</p>
              <p className="text-sm mb-4">{t('learn.empty.subtitle')}</p>
              <Button onClick={() => setShowUpload(true)}>
                <Plus size={16} className="mr-1.5" />
                {t('learn.upload.newMaterial')}
              </Button>
            </div>
          )}
        </main>

        {/* 右侧：摘要面板 */}
        <AnimatePresence>
          {summaryPanelOpen && currentMaterial && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-l border-paper-aged bg-paper-white overflow-hidden"
            >
              <SummaryPanel
                material={currentMaterial}
                onGenerateSummary={handleGenerateSummary}
                isGenerating={isGeneratingSummary}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* 上传弹窗 */}
      <Modal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        title={t('learn.upload.title')}
      >
        <MaterialUpload
          onUpload={handleUpload}
          onTextSubmit={handleTextSubmit}
          isUploading={isUploading}
        />
      </Modal>
    </div>
  )
}
