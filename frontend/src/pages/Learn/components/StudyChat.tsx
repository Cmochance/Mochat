import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import ThinkingBlock from '../../Chat/components/ThinkingBlock'
import type { StudyMessage } from '../../../types'

interface StudyChatProps {
  messages: StudyMessage[]
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  onSend: (content: string) => void
  disabled?: boolean
}

export default function StudyChat({
  messages,
  isStreaming,
  streamingContent,
  streamingThinking,
  onSend,
  disabled = false,
}: StudyChatProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || disabled || isStreaming) return
    onSend(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-ink-faint">
            <p className="text-lg mb-1">📚</p>
            <p className="text-sm">{t('learn.chat.emptyHint')}</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-1' : ''}`}>
              {msg.role === 'assistant' && msg.thinking && (
                <ThinkingBlock content={msg.thinking} />
              )}
              <div
                className={`rounded-sm p-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-ink-black text-paper-white'
                    : 'bg-paper-white border border-paper-aged text-ink-black'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-right' : ''} text-ink-faint`}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {/* 流式输出 */}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[80%]">
              {streamingThinking && (
                <ThinkingBlock content={streamingThinking} isStreaming={!streamingContent} hasContent={!!streamingContent} />
              )}
              <div className="rounded-sm p-3 text-sm bg-paper-white border border-paper-aged text-ink-black">
                {streamingContent ? (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="text-ink-faint text-xs">
                    {streamingThinking ? '' : t('learn.chat.thinking')}
                  </span>
                )}
                <span className="inline-block w-1.5 h-3.5 bg-ink-medium animate-pulse ml-0.5" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="border-t border-paper-aged p-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('learn.chat.placeholder')}
            rows={1}
            className="flex-1 px-3 py-2 border border-paper-aged rounded-sm text-sm
                       bg-paper-white text-ink-black placeholder:text-ink-faint
                       focus:outline-none focus:border-ink-black resize-none
                       max-h-32"
            style={{ height: 'auto', minHeight: '38px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 128) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || disabled || isStreaming}
            className="p-2.5 bg-ink-black text-paper-white rounded-sm
                       hover:bg-ink-medium disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {isStreaming ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
