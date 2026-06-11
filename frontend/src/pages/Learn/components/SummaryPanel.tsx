import { useState } from 'react'
import { Sparkles, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useTranslation } from 'react-i18next'
import type { LearningMaterial } from '../../../types'

interface SummaryPanelProps {
  material: LearningMaterial | null
  onGenerateSummary: () => void
  isGenerating: boolean
}

export default function SummaryPanel({ material, onGenerateSummary, isGenerating }: SummaryPanelProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)

  if (!material) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint p-4">
        <Sparkles size={24} className="mb-2" />
        <p className="text-sm text-center">{t('learn.summary.selectHint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 资料标题 */}
      <div className="px-4 py-3 border-b border-paper-aged">
        <h3 className="text-sm font-medium text-ink-black truncate">{material.title}</h3>
        <p className="text-xs text-ink-faint mt-0.5">
          {material.file_type.toUpperCase()} · {new Date(material.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* 摘要区 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
        <button
          className="flex items-center gap-1.5 text-sm font-medium text-ink-black mb-2 w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Sparkles size={14} />
          {t('learn.summary.title')}
        </button>

        {expanded && (
          <div>
            {material.summary ? (
              <div className="prose prose-sm max-w-none text-ink-medium prose-headings:text-ink-black prose-strong:text-ink-black">
                <ReactMarkdown>{material.summary}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-ink-faint mb-3">{t('learn.summary.noSummary')}</p>
                <button
                  onClick={onGenerateSummary}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm
                             bg-ink-black text-paper-white rounded-sm
                             hover:bg-ink-medium disabled:opacity-50 transition-colors"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t('learn.summary.generating')}
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      {t('learn.summary.generateBtn')}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
