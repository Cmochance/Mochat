import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import InputArea from './components/InputArea'
import { chatService } from '../../services/chatService'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import type { StreamChunk } from '../../types'

export default function Chat() {
  const { user } = useAuthStore()
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
    addMessage,
    setLoading,
    setStreaming,
    appendStreamingContent,
    appendStreamingThinking,
    clearStreaming,
    addSession,
    removeSession,
  } = useChatStore()

  const [sidebarOpen, setSidebarOpen] = useState(true)

  // 加载会话列表
  useEffect(() => {
    loadSessions()
  }, [])

  // 加载消息
  useEffect(() => {
    if (currentSession) {
      loadMessages(currentSession.id)
    }
  }, [currentSession?.id])

  const loadSessions = async () => {
    try {
      const data = await chatService.getSessions()
      setSessions(data)
      // 如果有会话，选中第一个
      if (data.length > 0 && !currentSession) {
        setCurrentSession(data[0])
      }
    } catch (error) {
      console.error('加载会话失败:', error)
    }
  }

  const loadMessages = async (sessionId: number) => {
    setLoading(true)
    try {
      const data = await chatService.getMessages(sessionId)
      setMessages(data)
    } catch (error) {
      console.error('加载消息失败:', error)
    } finally {
      setLoading(false)
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

  const handleSendMessage = async (content: string) => {
    if (!currentSession) {
      // 如果没有当前会话，先创建一个
      const session = await chatService.createSession()
      addSession(session)
      setCurrentSession(session)
      await sendMessageToSession(session.id, content)
    } else {
      await sendMessageToSession(currentSession.id, content)
    }
  }

  const sendMessageToSession = async (sessionId: number, content: string) => {
    // 添加用户消息
    addMessage({
      id: Date.now(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    })

    setStreaming(true)
    clearStreaming()

    try {
      await chatService.sendMessage(sessionId, content, (chunk: StreamChunk) => {
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
          clearStreaming()
        } else if (chunk.type === 'error') {
          console.error('AI响应错误:', chunk.data)
          clearStreaming()
        }
      })
    } catch (error) {
      console.error('发送消息失败:', error)
      clearStreaming()
    }

    // 注意：不在这里调用 setStreaming(false)，因为 clearStreaming() 已经处理了
    // 刷新会话列表（可能标题已更新）
    loadSessions()
  }

  return (
    <div className="h-screen flex bg-paper-gradient overflow-hidden">
      {/* 侧边栏 */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        sessions={sessions}
        currentSession={currentSession}
        onSelectSession={setCurrentSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        username={user?.username || '用户'}
      />

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 头部 */}
        <motion.header
          className="h-16 border-b border-paper-aged bg-paper-white/80 backdrop-blur-sm flex items-center px-6"
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
            {currentSession?.title || '新对话'}
          </h1>
        </motion.header>

        {/* 消息区域 */}
        <MessageList
          messages={messages}
          isLoading={isLoading}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          streamingThinking={streamingThinking}
        />

        {/* 输入区域 */}
        <InputArea
          onSend={handleSendMessage}
          disabled={isStreaming}
        />
      </main>
    </div>
  )
}
