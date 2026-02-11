import type { KeyboardEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatMode } from '../../../../types'

interface ComposerTextAreaProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  disabled?: boolean
  textareaRef?: RefObject<HTMLTextAreaElement>
  mode: ChatMode
  className?: string
}

export default function ComposerTextArea({
  value,
  onChange,
  onKeyDown,
  disabled = false,
  textareaRef,
  mode,
  className = '',
}: ComposerTextAreaProps) {
  const { t } = useTranslation()

  const placeholder = mode === 'draw'
    ? t('input.drawModePlaceholder')
    : mode === 'ppt'
      ? t('input.pptModePlaceholder')
      : t('input.placeholder')

  return (
    <div className={`relative min-w-0 flex-1 ${className}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={`
          w-full resize-none rounded-md border-2 bg-paper-white px-4 py-3 pr-12
          font-body text-ink-black placeholder:text-ink-faint
          transition-colors duration-200 focus:outline-none
          disabled:cursor-not-allowed disabled:opacity-50
          ${mode === 'draw'
            ? 'border-cyan-ink/50 focus:border-cyan-ink'
            : mode === 'ppt'
              ? 'border-vermilion/50 focus:border-vermilion'
              : 'border-paper-aged focus:border-ink-medium'
          }
        `}
        style={{ minHeight: '52px', maxHeight: '200px' }}
      />
      <span className="absolute bottom-2.5 right-3 text-xs font-ui text-ink-faint">
        {value.length}
      </span>
    </div>
  )
}
