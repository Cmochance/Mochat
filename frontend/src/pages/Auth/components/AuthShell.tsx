import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import LanguageSwitcher from '../../../components/common/LanguageSwitcher'

interface AuthShellProps {
  title: string
  subtitle: string
  backText: string
  onBack: () => void
  decorativeMain: string
  decorativeSub: ReactNode
  side?: 'left' | 'right'
  children: ReactNode
  footer?: ReactNode
}

export default function AuthShell({
  title,
  subtitle,
  backText,
  onBack,
  decorativeMain,
  decorativeSub,
  side = 'left',
  children,
  footer,
}: AuthShellProps) {
  const formPanel = (
    <motion.div
      className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-12"
      initial={{ x: side === 'left' ? -40 : 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="w-full max-w-md">
        <button
          className="mb-8 flex items-center gap-2 rounded-md px-2 py-1 text-sm font-ui text-ink-light transition-colors hover:bg-paper-cream hover:text-ink-black"
          onClick={onBack}
        >
          <ArrowLeft size={16} />
          {backText}
        </button>

        <div className="mb-8">
          <h2 className="text-4xl font-title text-ink-black">{title}</h2>
          <p className="mt-2 font-ui text-sm text-text-secondary">{subtitle}</p>
        </div>

        {children}

        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </motion.div>
  )

  const decorativePanel = (
    <motion.div
      className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center bg-ink-dark text-paper-white"
      initial={{ x: side === 'left' ? 40 : -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="absolute inset-0">
        <motion.div
          className="absolute -top-10 right-10 h-72 w-72 rounded-full bg-paper-white/10 blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 7, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-0 -left-10 h-80 w-80 rounded-full bg-cyan-ink/20 blur-3xl"
          animate={{ scale: [1.1, 0.95, 1.1], opacity: [0.35, 0.18, 0.35] }}
          transition={{ duration: 7, repeat: Infinity }}
        />
      </div>

      <div className="relative z-10 max-w-md px-10 text-center">
        <div className="text-8xl font-title text-paper-white/95">{decorativeMain}</div>
        <div className="mt-5 font-ui leading-relaxed text-paper-cream/85">{decorativeSub}</div>
      </div>
    </motion.div>
  )

  return (
    <div className="min-h-screen bg-canvas-gradient flex">
      {side === 'left' ? (
        <>
          {decorativePanel}
          {formPanel}
        </>
      ) : (
        <>
          {formPanel}
          {decorativePanel}
        </>
      )}

      <LanguageSwitcher className="right-4 top-4" />
    </div>
  )
}
