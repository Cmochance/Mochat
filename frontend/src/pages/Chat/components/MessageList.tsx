import { useEffect, useRef } from 'react'
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
}

export default function MessageList({
  messages,
  isLoading,
  isStreaming,
  streamingContent,
  streamingThinking,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loading text="加载中..." />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 min-h-0">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 空状态 */}
        {messages.length === 0 && !isStreaming && (
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
