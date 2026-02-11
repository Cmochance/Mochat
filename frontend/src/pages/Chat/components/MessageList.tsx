import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquareText, Palette, Presentation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MessageItem from './MessageItem'
import StreamingMessage from './StreamingMessage'
import Loading from '../../../components/common/Loading'
import Button from '../../../components/common/Button'
import EmptyState from '../../../components/common/EmptyState'
import type { ChatMode, Message } from '../../../types'

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
  onRegenerate?: () => void  // 重新生成最后一条AI消息
  onQuickAction?: (mode: ChatMode) => void
}

// 获取滚动位置存储的 key（localStorage - 持久保存）
const getScrollKey = (sessionId: number) => `mochat_scroll_${sessionId}`
// 获取"已访问过"标记的 key（sessionStorage - 标签页关闭后清除）
const getVisitedKey = (sessionId: number) => `mochat_visited_${sessionId}`

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
  onRegenerate,
  onQuickAction,
}: MessageListProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef(0)
  const hasInitializedRef = useRef(false)  // 防止重复初始化

  // 保存滚动位置
  const saveScrollPosition = useCallback(() => {
    if (containerRef.current && sessionId) {
      const scrollTop = containerRef.current.scrollTop
      localStorage.setItem(getScrollKey(sessionId), String(scrollTop))
    }
  }, [sessionId])

  // 恢复滚动位置或滚动到底部（仅在首次打开标签页时滚动到底部）
  useEffect(() => {
    if (!isLoading && messages.length > 0 && sessionId && containerRef.current && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      
      requestAnimationFrame(() => {
        const container = containerRef.current
        if (!container) return
        
        const visitedKey = getVisitedKey(sessionId)
        const scrollKey = getScrollKey(sessionId)
        const hasVisited = sessionStorage.getItem(visitedKey)
        const savedPosition = localStorage.getItem(scrollKey)
        
        if (!hasVisited) {
          // 首次打开此标签页：滚动到底部
          container.scrollTop = container.scrollHeight
          // 标记为已访问
          sessionStorage.setItem(visitedKey, 'true')
        } else if (savedPosition) {
          // 已访问过且有保存的位置：恢复到保存的位置
          container.scrollTop = Number(savedPosition)
        }
        // 其他情况：保持默认位置（通常是顶部，但由于消息已渲染，会保持当前位置）
      })
    }
  }, [isLoading, messages.length, sessionId])

  // 会话切换时，重置初始化标记
  useEffect(() => {
    hasInitializedRef.current = false
  }, [sessionId])

  // 注意：新消息、流式输出、加载历史消息都不自动滚动，保持当前位置

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
        <Loading text={t('common.loading')} />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-0 flex-grow overflow-y-auto px-4 py-6">
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
            className="py-14"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <EmptyState
              icon={<div className="text-6xl font-title text-ink-light/50">墨</div>}
              title={t('chat.empty.title')}
              description={t('chat.empty.description')}
              actions={
                <>
                  <Button variant="secondary" onClick={() => onQuickAction?.('chat')}>
                    <MessageSquareText size={16} />
                    {t('chat.quick.chat')}
                  </Button>
                  <Button variant="outline" onClick={() => onQuickAction?.('draw')}>
                    <Palette size={16} />
                    {t('chat.quick.draw')}
                  </Button>
                  <Button variant="outline" onClick={() => onQuickAction?.('ppt')}>
                    <Presentation size={16} />
                    {t('chat.quick.ppt')}
                  </Button>
                </>
              }
            />
          </motion.div>
        )}

        {/* 消息列表 */}
        <AnimatePresence>
          {messages.map((message, index) => {
            // 找出最后一条 AI 消息的索引
            const lastAiIndex = messages.map((m, i) => m.role === 'assistant' ? i : -1)
              .filter(i => i !== -1).pop()
            const isLastAiMessage = message.role === 'assistant' && index === lastAiIndex
            
            return (
              <MessageItem
                key={message.id}
                message={message}
                index={index}
                isLastAiMessage={isLastAiMessage}
                onRegenerate={onRegenerate}
              />
            )
          })}
        </AnimatePresence>

        {/* 流式响应中的消息 - 使用专门的流式组件，直接操作 DOM */}
        {isStreaming && (streamingContent || streamingThinking) && (
          <StreamingMessage
            content={streamingContent}
            thinking={streamingThinking}
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
