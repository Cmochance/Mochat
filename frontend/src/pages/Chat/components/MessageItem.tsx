import { motion } from 'framer-motion'
import { User } from 'lucide-react'
import ThinkingBlock from './ThinkingBlock'
import type { Message } from '../../../types'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MessageItemProps {
  message: Message
  index: number
  isStreaming?: boolean
}

export default function MessageItem({ message, index, isStreaming = false }: MessageItemProps) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      {/* 头像 */}
      <div
        className={`
          w-10 h-10 rounded-full flex items-center justify-center shrink-0
          ${isUser ? 'bg-cyan-ink' : 'bg-ink-black'}
        `}
      >
        {isUser ? (
          <User size={20} className="text-paper-white" />
        ) : (
          <span className="text-paper-white font-title">墨</span>
        )}
      </div>

      {/* 消息内容 */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        {/* Thinking块（仅AI消息） */}
        {!isUser && message.thinking && (
          <ThinkingBlock
            content={message.thinking}
            isStreaming={isStreaming}
          />
        )}

        {/* 消息气泡 */}
        <div
          className={`
            p-4 rounded-sm
            ${isUser
              ? 'bg-ink-black text-paper-white'
              : 'bg-paper-white border border-paper-aged text-ink-black'
            }
          `}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '')
                    const inline = !match
                    return !inline ? (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: '1rem 0',
                          borderRadius: '0.125rem',
                          fontSize: '0.875rem',
                        }}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  },
                }}
              >
                {message.content || (isStreaming ? '▌' : '')}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* 时间戳 */}
        <p className={`text-xs text-ink-faint mt-2 ${isUser ? 'text-right' : ''}`}>
          {new Date(message.created_at).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </motion.div>
  )
}
