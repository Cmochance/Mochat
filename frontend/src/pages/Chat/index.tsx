import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import InputArea, { type ModelInfo } from './components/InputArea'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import { useVersion, VersionModal } from '@upgrade'
import { useImageGenerate } from '@picgenerate'
import { usePPTGenerate } from '@pptgen'
import { chatService } from '../../services/chatService'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import type { StreamChunk } from '../../types'

export default function Chat() {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  const {
    sessions,
    currentSession,
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    streamingThinking,
    setSessions,
    setCurrentSession,
    setMessages,
    prependMessages,
    addMessage,
    setLoading,
    setStreaming,
    appendStreamingContent,
    appendStreamingThinking,
    clearStreaming,
    endStreaming,
    addSession,
    removeSession,
  } = useChatStore()

  // 侧边栏状态 - 默认关闭，根据屏幕大小在挂载后调整
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  // 版本更新通知 (使用独立模块)
  const { versionInfo, showModal: showVersionModal, closeModal: closeVersionModal } = useVersion()
  
  // 模型选择状态
  const [models, setModels] = useState<ModelInfo[]>([])
  const [currentModel, setCurrentModel] = useState<string>('')
  const [defaultModel, setDefaultModel] = useState<string>('')
  
  // 绘图模式状态
  const [isDrawMode, setIsDrawMode] = useState(false)
  
  // PPT 模式状态
  const [isPPTMode, setIsPPTMode] = useState(false)
  
  // 绘图 Hook
  const { 
    generate: generateImage, 
    isGenerating: isDrawing, 
    reset: resetDraw 
  } = useImageGenerate({ apiBasePath: '/api/chat/image' })
  
  // PPT 生成 Hook
  const {
    generatePPT,
    isGenerating: isGeneratingPPT,
    reset: resetPPT
  } = usePPTGenerate({ apiBase: '/api/chat/ppt', userId: user?.id?.toString() })
  
  // 挂载时根据屏幕大小设置侧边栏状态
  useEffect(() => {
    const isLargeScreen = window.innerWidth >= 1024
    setSidebarOpen(isLargeScreen)
  }, [])

  // 加载会话列表
  useEffect(() => {
    loadSessions()
  }, [])

  // 加载模型列表
  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    try {
      const data = await chatService.getModels()
      setModels(data.models)
      setDefaultModel(data.default_model)
      // 从 localStorage 恢复上次选择的模型，否则使用默认模型
      const savedModel = localStorage.getItem('mochat_current_model')
      if (savedModel && data.models.some(m => m.id === savedModel)) {
        setCurrentModel(savedModel)
      } else {
        setCurrentModel(data.default_model)
      }
    } catch (error) {
      console.error('加载模型列表失败:', error)
    }
  }

  // 保存选择的模型
  const handleModelChange = (model: string) => {
    setCurrentModel(model)
    localStorage.setItem('mochat_current_model', model)
  }

  // 加载消息
  useEffect(() => {
    if (currentSession) {
      loadMessages(currentSession.id)
    }
  }, [currentSession?.id])

  // 保存当前会话 ID 到 localStorage
  useEffect(() => {
    if (currentSession) {
      localStorage.setItem('mochat_last_session_id', String(currentSession.id))
    }
  }, [currentSession?.id])

  const loadSessions = async () => {
    try {
      const data = await chatService.getSessions()
      setSessions(data)
      
      // 如果有会话，优先恢复上次打开的会话
      if (data.length > 0 && !currentSession) {
        const lastSessionId = localStorage.getItem('mochat_last_session_id')
        if (lastSessionId) {
          const lastSession = data.find(s => s.id === Number(lastSessionId))
          if (lastSession) {
            setCurrentSession(lastSession)
            return
          }
        }
        // 如果上次的会话不存在，选中第一个
        setCurrentSession(data[0])
      }
    } catch (error) {
      console.error('加载会话失败:', error)
    }
  }

  // 是否还有更多历史消息
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  // 是否正在加载更多消息
  const [loadingMore, setLoadingMore] = useState(false)

  // 过滤消息中的文档内容
  const filterMessages = (data: typeof messages) => {
    return data.map(msg => {
      if (msg.role === 'user' && msg.content) {
        // 移除旧格式中的文档内容，只保留文件名
        const filtered = msg.content.replace(
          /<!-- DOC:([^:>]+?) -->[\s\S]*?<!-- \/DOC -->/g,
          '<!-- DOC:$1 --><!-- /DOC -->'
        )
        return { ...msg, content: filtered }
      }
      return msg
    })
  }

  const loadMessages = async (sessionId: number) => {
    setLoading(true)
    setHasMoreMessages(false)
    try {
      const result = await chatService.getMessages(sessionId, 10)
      setMessages(filterMessages(result.messages))
      setHasMoreMessages(result.has_more)
    } catch (error) {
      console.error('加载消息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 加载更多历史消息
  const loadMoreMessages = async () => {
    if (!currentSession || loadingMore || !hasMoreMessages || messages.length === 0) return
    
    setLoadingMore(true)
    try {
      const oldestMessageId = messages[0].id
      const result = await chatService.getMessages(currentSession.id, 10, oldestMessageId)
      
      if (result.messages.length > 0) {
        // 将新加载的消息添加到列表前面
        prependMessages(filterMessages(result.messages))
        setHasMoreMessages(result.has_more)
      }
    } catch (error) {
      console.error('加载更多消息失败:', error)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleNewSession = async () => {
    try {
      const session = await chatService.createSession()
      addSession(session)
      setCurrentSession(session)
      setMessages([])
    } catch (error) {
      console.error('创建会话失败:', error)
    }
  }

  const handleDeleteSession = async (sessionId: number) => {
    try {
      await chatService.deleteSession(sessionId)
      removeSession(sessionId)
      if (currentSession?.id === sessionId) {
        setCurrentSession(sessions.find(s => s.id !== sessionId) || null)
      }
    } catch (error) {
      console.error('删除会话失败:', error)
    }
  }

  const handleSendMessage = async (content: string, model?: string) => {
    if (!currentSession) {
      // 如果没有当前会话，先创建一个
      const session = await chatService.createSession()
      addSession(session)
      setCurrentSession(session)
      await sendMessageToSession(session.id, content, model)
    } else {
      await sendMessageToSession(currentSession.id, content, model)
    }
  }

  const sendMessageToSession = async (sessionId: number, content: string, model?: string) => {
    // 新版本：消息中已经只包含元数据，不需要再过滤
    // 格式: <!-- DOC:filename:key --><!-- /DOC -->
    const displayContent = content
    
    // 添加用户消息（显示版本，不含文档内容）
    addMessage({
      id: Date.now(),
      role: 'user',
      content: displayContent,
      created_at: new Date().toISOString(),
    })

    setStreaming(true)
    clearStreaming()

    try {
      await chatService.sendMessage(sessionId, content, (chunk: StreamChunk) => {
        // 使用 flushSync 强制同步渲染，解决 React 18 批处理导致的流式输出延迟
        flushSync(() => {
          if (chunk.type === 'thinking') {
            appendStreamingThinking(chunk.data)
          } else if (chunk.type === 'content') {
            appendStreamingContent(chunk.data)
          } else if (chunk.type === 'done') {
            // 完成时，将流式内容转为正式消息
            const state = useChatStore.getState()
            addMessage({
              id: Date.now(),
              role: 'assistant',
              content: state.streamingContent,
              thinking: state.streamingThinking || undefined,
              created_at: new Date().toISOString(),
            })
            endStreaming()  // 使用 endStreaming 完全结束流式状态
          } else if (chunk.type === 'error') {
            console.error('AI响应错误:', chunk.data)
            endStreaming()  // 使用 endStreaming 完全结束流式状态
          }
        })
      }, model)
    } catch (error) {
      console.error('发送消息失败:', error)
      endStreaming()  // 使用 endStreaming 完全结束流式状态
    }

    // 注意：不在这里调用 setStreaming(false)，因为 clearStreaming() 已经处理了
    // 刷新会话列表（可能标题已更新）
    loadSessions()
  }

  // 处理绘图请求
  const handleGenerateImage = async (prompt: string) => {
    if (!currentSession) {
      // 如果没有当前会话，先创建一个
      const session = await chatService.createSession()
      addSession(session)
      setCurrentSession(session)
      await generateImageInSession(session.id, prompt)
    } else {
      await generateImageInSession(currentSession.id, prompt)
    }
  }

  const generateImageInSession = async (_sessionId: number, prompt: string) => {
    // 添加用户消息
    addMessage({
      id: Date.now(),
      role: 'user',
      content: `🎨 绘图请求：${prompt}`,
      created_at: new Date().toISOString(),
    })

    setStreaming(true)
    clearStreaming()

    try {
      // 调用绘图模块
      const result = await generateImage(
        { prompt, userId: user?.id?.toString() || 'anonymous' },
        (thinkingChunk) => {
          // thinking 回调，实时更新
          flushSync(() => {
            appendStreamingThinking(thinkingChunk)
          })
        }
      )

      // 生成完成后，添加 AI 消息
      const state = useChatStore.getState()
      
      if (result.success && result.imageUrl) {
        // 成功：显示图片
        addMessage({
          id: Date.now(),
          role: 'assistant',
          content: `![AI生成的图像](${result.imageUrl})`,
          thinking: state.streamingThinking || undefined,
          created_at: new Date().toISOString(),
        })
      } else {
        // 失败：显示错误
        addMessage({
          id: Date.now(),
          role: 'assistant',
          content: `❌ 图像生成失败：${result.error || '未知错误'}`,
          thinking: state.streamingThinking || undefined,
          created_at: new Date().toISOString(),
        })
      }
      
      endStreaming()
      resetDraw()
      
    } catch (error) {
      console.error('绘图失败:', error)
      addMessage({
        id: Date.now(),
        role: 'assistant',
        content: `❌ 图像生成失败：${error instanceof Error ? error.message : '未知错误'}`,
        created_at: new Date().toISOString(),
      })
      endStreaming()
      resetDraw()
    }

    // 刷新会话列表
    loadSessions()
  }

  // 处理 PPT 生成请求
  const handleGeneratePPT = async (prompt: string) => {
    if (!currentSession) {
      const session = await chatService.createSession()
      addSession(session)
      setCurrentSession(session)
      await generatePPTInSession(session.id, prompt)
    } else {
      await generatePPTInSession(currentSession.id, prompt)
    }
  }

  const generatePPTInSession = async (sessionId: number, prompt: string) => {
    const userContent = `📊 PPT 生成请求：${prompt}`
    
    // 添加用户消息
    addMessage({
      id: Date.now(),
      role: 'user',
      content: userContent,
      created_at: new Date().toISOString(),
    })

    setStreaming(true)
    clearStreaming()

    try {
      const result = await generatePPT(
        { prompt },
        (thinkingChunk) => {
          flushSync(() => {
            appendStreamingThinking(thinkingChunk)
          })
        }
      )

      const state = useChatStore.getState()
      const thinking = state.streamingThinking || undefined
      
      let assistantContent: string
      
      if (result.success && result.pptUrl) {
        assistantContent = `📊 PPT 生成成功！\n\n**${result.title || '演示文稿'}**\n\n[📥 点击下载 PPT](${result.pptUrl})`
        addMessage({
          id: Date.now(),
          role: 'assistant',
          content: assistantContent,
          thinking,
          created_at: new Date().toISOString(),
        })
      } else {
        assistantContent = `❌ PPT 生成失败：${result.error || '未知错误'}`
        addMessage({
          id: Date.now(),
          role: 'assistant',
          content: assistantContent,
          thinking,
          created_at: new Date().toISOString(),
        })
      }
      
      // 保存消息到数据库
      try {
        await chatService.saveMessage(sessionId, 'user', userContent)
        await chatService.saveMessage(sessionId, 'assistant', assistantContent, thinking)
      } catch (saveError) {
        console.error('保存 PPT 消息失败:', saveError)
      }
      
      endStreaming()
      resetPPT()
      
    } catch (error) {
      console.error('PPT 生成失败:', error)
      const assistantContent = `❌ PPT 生成失败：${error instanceof Error ? error.message : '未知错误'}`
      addMessage({
        id: Date.now(),
        role: 'assistant',
        content: assistantContent,
        created_at: new Date().toISOString(),
      })
      
      try {
        await chatService.saveMessage(sessionId, 'user', userContent)
        await chatService.saveMessage(sessionId, 'assistant', assistantContent)
      } catch (saveError) {
        console.error('保存 PPT 消息失败:', saveError)
      }
      
      endStreaming()
      resetPPT()
    }

    loadSessions()
  }

  // 重新生成最后一条 AI 消息
  const handleRegenerate = async () => {
    if (!currentSession || isStreaming) return

    // 移除最后一条 AI 消息
    const lastAiMessageIndex = messages.map((m, i) => m.role === 'assistant' ? i : -1)
      .filter(i => i !== -1).pop()
    
    if (lastAiMessageIndex === undefined) return
    
    // 从 store 中移除最后一条 AI 消息
    const updatedMessages = messages.filter((_, i) => i !== lastAiMessageIndex)
    setMessages(updatedMessages)

    setStreaming(true)
    clearStreaming()

    try {
      await chatService.regenerateResponse(currentSession.id, (chunk: StreamChunk) => {
        // 使用 flushSync 强制同步渲染
        flushSync(() => {
          if (chunk.type === 'thinking') {
            appendStreamingThinking(chunk.data)
          } else if (chunk.type === 'content') {
            appendStreamingContent(chunk.data)
          } else if (chunk.type === 'done') {
            const state = useChatStore.getState()
            addMessage({
              id: Date.now(),
              role: 'assistant',
              content: state.streamingContent,
              thinking: state.streamingThinking || undefined,
              created_at: new Date().toISOString(),
            })
            endStreaming()  // 使用 endStreaming 完全结束流式状态
          } else if (chunk.type === 'error') {
            console.error('重新生成失败:', chunk.data)
            endStreaming()  // 使用 endStreaming 完全结束流式状态
          }
        })
      })
    } catch (error) {
      console.error('重新生成失败:', error)
      endStreaming()  // 使用 endStreaming 完全结束流式状态
    }
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] flex bg-paper-gradient overflow-hidden">
      {/* 版本更新弹窗 (独立模块) */}
      {showVersionModal && (
        <VersionModal versionInfo={versionInfo} onClose={closeVersionModal} />
      )}

      {/* 侧边栏 */}
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          sessions={sessions}
          currentSession={currentSession}
          onSelectSession={setCurrentSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          username={user?.username || t('common.user')}
        />

      {/* 主内容区 - 严格高度约束 */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 max-h-full overflow-hidden">
        {/* 头部 */}
        <motion.header
          className="h-16 border-b border-paper-aged bg-paper-white/80 backdrop-blur-sm flex items-center px-6 flex-shrink-0"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            className="lg:hidden mr-4 p-2 hover:bg-paper-cream rounded-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-xl font-title text-ink-black truncate">
            {currentSession?.title || t('chat.newChat')}
          </h1>
        </motion.header>

        {/* 消息区域 */}
        <MessageList
          messages={messages}
          isLoading={isLoading}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          streamingThinking={streamingThinking}
          sessionId={currentSession?.id}
          hasMore={hasMoreMessages}
          loadingMore={loadingMore}
          onLoadMore={loadMoreMessages}
          onRegenerate={handleRegenerate}
        />

        {/* 输入区域 */}
        <InputArea
          onSend={handleSendMessage}
          onGenerateImage={handleGenerateImage}
          onGeneratePPT={handleGeneratePPT}
          disabled={isStreaming || isDrawing || isGeneratingPPT}
          models={models}
          currentModel={currentModel}
          defaultModel={defaultModel}
          onModelChange={handleModelChange}
          isDrawMode={isDrawMode}
          onDrawModeChange={setIsDrawMode}
          isPPTMode={isPPTMode}
          onPPTModeChange={setIsPPTMode}
        />
      </main>

      {/* 语言切换按钮 */}
      <LanguageSwitcher className="top-4 right-3 bottom-auto lg:top-auto lg:right-6 lg:bottom-2" />
    </div>
  )
}
