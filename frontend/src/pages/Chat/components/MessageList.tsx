import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import MessageItem from './MessageItem'
import Loading from '../../../components/common/Loading'
import type { Message } from '../../../types'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  sessionId?: number  // 用于保存/恢复滚动位置
  hasMore?: boolean  // 是否还有更多历史消息
  loadingMore?: boolean  // 是否正在加载更多
  onLoadMore?: () => void  // 加载更多回调
}

// 获取滚动位置存储的 key
const getScrollKey = (sessionId: number) => `mochat_scroll_${sessionId}`

export default function MessageList({
  messages,
  isLoading,
  isStreaming,
  streamingContent,
  streamingThinking,
  sessionId,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const prevMessagesLengthRef = useRef(0)
  const prevSessionIdRef = useRef<number | undefined>(undefined)
  const prevScrollHeightRef = useRef(0)

  // 保存滚动位置
  const saveScrollPosition = useCallback(() => {
    if (containerRef.current && sessionId) {
      const scrollTop = containerRef.current.scrollTop
      localStorage.setItem(getScrollKey(sessionId), String(scrollTop))
    }
  }, [sessionId])

  // 恢复滚动位置（直接定位，无动画）
  const restoreScrollPosition = useCallback(() => {
    if (containerRef.current && sessionId) {
      const savedPosition = localStorage.getItem(getScrollKey(sessionId))
      if (savedPosition) {
        containerRef.current.scrollTop = Number(savedPosition)
      } else {
        // 没有保存的位置，滚动到底部
        containerRef.current.scrollTop = containerRef.current.scrollHeight
      }
    }
  }, [sessionId])

  // 会话切换时，重置初始加载状态
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current) {
      setIsInitialLoad(true)
      prevSessionIdRef.current = sessionId
    }
  }, [sessionId])

  // 消息加载完成后恢复滚动位置
  useEffect(() => {
    if (!isLoading && messages.length > 0 && isInitialLoad && containerRef.current) {
      // 使用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        restoreScrollPosition()
        setIsInitialLoad(false)
        prevMessagesLengthRef.current = messages.length
      })
    }
  }, [isLoading, messages.length, isInitialLoad, restoreScrollPosition])

  // 新消息到达时滚动到底部（仅限非初始加载）
  useEffect(() => {
    if (!isInitialLoad && messages.length > prevMessagesLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      prevMessagesLengthRef.current = messages.length
    }
  }, [messages.length, isInitialLoad])

  // 流式输出时滚动到底部
  useEffect(() => {
    if (isStreaming && streamingContent) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isStreaming, streamingContent])

  // 监听滚动事件保存位置 & 检测滚动到顶部加载更多
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      // 保存滚动位置
      saveScrollPosition()
      
      // 检测是否滚动到顶部附近（距离顶部 50px 内）
      if (container.scrollTop < 50 && hasMore && !loadingMore && onLoadMore) {
        // 保存当前滚动高度，用于加载后恢复位置
        prevScrollHeightRef.current = container.scrollHeight
        onLoadMore()
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [saveScrollPosition, hasMore, loadingMore, onLoadMore])

  // 加载更多消息后，保持滚动位置
  useEffect(() => {
    const container = containerRef.current
    if (!container || loadingMore) return
    
    // 如果滚动高度增加了，说明加载了更多消息，需要调整滚动位置
    if (prevScrollHeightRef.current > 0) {
      const newScrollHeight = container.scrollHeight
      const heightDiff = newScrollHeight - prevScrollHeightRef.current
      if (heightDiff > 0) {
        container.scrollTop += heightDiff
      }
      prevScrollHeightRef.current = 0
    }
  }, [messages.length, loadingMore])

  // 页面离开时保存滚动位置
  useEffect(() => {
    const handleBeforeUnload = () => saveScrollPosition()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveScrollPosition])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loading text="加载中..." />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6 min-h-0">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 加载更多历史消息 */}
        {hasMore && (
          <div ref={topRef} className="flex justify-center py-2">
            {loadingMore ? (
              <div className="flex items-center gap-2 text-ink-light text-sm">
                <div className="w-4 h-4 border-2 border-ink-faint border-t-ink-medium rounded-full animate-spin" />
                <span>加载中...</span>
              </div>
            ) : (
              <button
                onClick={onLoadMore}
                className="text-sm text-ink-light hover:text-ink-medium transition-colors"
              >
                ↑ 加载更早的消息
              </button>
            )}
          </div>
        )}

        {/* 空状态 */}
        {messages.length === 0 && !isStreaming && !hasMore && (
          <motion.div
            className="text-center py-20"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-6xl font-title text-ink-light/30 mb-4">墨</div>
            <p className="text-ink-light">开始一段新的对话吧</p>
          </motion.div>
        )}

        {/* 消息列表 */}
        <AnimatePresence>
          {messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              index={index}
            />
          ))}
        </AnimatePresence>

        {/* 流式响应中的消息 */}
        {isStreaming && (streamingContent || streamingThinking) && (
          <MessageItem
            message={{
              id: -1,
              role: 'assistant',
              content: streamingContent,
              thinking: streamingThinking,
              created_at: new Date().toISOString(),
            }}
            index={messages.length}
            isStreaming
          />
        )}

        {/* 等待响应的加载动画 */}
        {isStreaming && !streamingContent && !streamingThinking && (
          <motion.div
            className="flex gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-10 h-10 rounded-full bg-ink-black flex items-center justify-center shrink-0">
              <span className="text-paper-white font-title">墨</span>
            </div>
            <div className="flex-1 p-4 bg-paper-white rounded-sm border border-paper-aged">
              <div className="flex items-center text-ink-light">
                <span className="text-sm">等待中</span>
                <motion.span
                  className="text-sm"
                  animate={{ opacity: [0, 1, 1, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, times: [0, 0.3, 0.6, 1] }}
                >
                  。
                </motion.span>
                <motion.span
                  className="text-sm"
                  animate={{ opacity: [0, 0, 1, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, times: [0, 0.3, 0.6, 1] }}
                >
                  。
                </motion.span>
                <motion.span
                  className="text-sm"
                  animate={{ opacity: [0, 0, 0, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, times: [0, 0.3, 0.6, 1] }}
                >
                  。
                </motion.span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
