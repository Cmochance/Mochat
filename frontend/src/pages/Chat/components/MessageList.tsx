import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import MessageItem from './MessageItem'
import StreamingMessage from './StreamingMessage'
import Loading from '../../../components/common/Loading'
import EmptyState from '../../../components/common/EmptyState'
import type { Message } from '../../../types'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  streamingToolStatus: string
  sessionId?: number
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  onRegenerate?: () => void
}

const getScrollKey = (sessionId: number) => `mochat_scroll_${sessionId}`
const getVisitedKey = (sessionId: number) => `mochat_visited_${sessionId}`

export default function MessageList({
  messages,
  isLoading,
  isStreaming,
  streamingContent,
  streamingThinking,
  streamingToolStatus,
  sessionId,
  hasMore,
  loadingMore,
  onLoadMore,
  onRegenerate,
}: MessageListProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMessageRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const hasRestoredScroll = useRef(false)

  const saveScrollPosition = useCallback(() => {
    if (containerRef.current && sessionId) {
      const { scrollTop } = containerRef.current
      sessionStorage.setItem(getScrollKey(sessionId), String(scrollTop))
    }
  }, [sessionId])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior })
    }
  }, [])

  const handleScroll = useCallback(() => {
    if (!containerRef.current || !sessionId) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50
    saveScrollPosition()
    if (scrollTop === 0 && hasMore && !loadingMore) {
      const prevHeight = scrollHeight
      onLoadMore?.()
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight - prevHeight
        }
      })
    }
  }, [sessionId, hasMore, loadingMore, onLoadMore, saveScrollPosition])

  // 恢复滚动位置
  useEffect(() => {
    if (!sessionId || !containerRef.current) return
    if (hasRestoredScroll.current) return
    const savedScroll = sessionStorage.getItem(getScrollKey(sessionId))
    if (savedScroll) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = parseInt(savedScroll, 10)
          hasRestoredScroll.current = true
        }
      })
    } else {
      const hasVisited = sessionStorage.getItem(getVisitedKey(sessionId))
      if (!hasVisited) {
        scrollToBottom('instant')
        sessionStorage.setItem(getVisitedKey(sessionId), '1')
      }
      hasRestoredScroll.current = true
    }
  }, [sessionId, scrollToBottom])

  // 流式输出时自动滚动
  useEffect(() => {
    if (isStreaming && isAtBottomRef.current) {
      scrollToBottom('instant')
    }
  }, [streamingContent, streamingThinking, isStreaming, scrollToBottom])

  useEffect(() => {
    if (!isLoading && messages.length > 0 && !isStreaming) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg.role === 'user' && isAtBottomRef.current) {
        scrollToBottom('smooth')
      }
    }
  }, [messages, isLoading, isStreaming, scrollToBottom])

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth"
    >
      {/* 加载更多 */}
      {hasMore && (
        <div className="text-center py-4">
          {loadingMore ? (
            <Loading text="" />
          ) : (
            <button onClick={onLoadMore} className="text-ink-light hover:text-ink-black text-sm">
              {t('chat.loadMore')}
            </button>
          )}
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && messages.length === 0 && !isStreaming && (
        <EmptyState 
          title={t('chat.emptyTitle', '开始新的对话')} 
          description={t('chat.emptyDesc', '与 AI 助手开始对话吧。')} 
        />
      )}

      {/* 消息列表 */}
      <AnimatePresence mode="popLayout">
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            ref={index === messages.length - 1 ? lastMessageRef : undefined}
          >
            <MessageItem
              message={message}
              index={index}
              isLastAiMessage={index === messages.length - 1 && message.role === 'assistant'}
              onRegenerate={onRegenerate}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 流式输出 */}
      {isStreaming && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          {/* 工具调用状态展示 */}
          {streamingToolStatus && (
            <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-sm">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {streamingToolStatus}
            </div>
          )}
          <StreamingMessage content={streamingContent} thinking={streamingThinking} />
        </motion.div>
      )}

      {/* 加载中 */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-start mb-6"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-ink-black flex items-center justify-center text-paper-white text-xs">
              AI
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
          </div>
        </motion.div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
