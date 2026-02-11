import { motion } from 'framer-motion'
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../../i18n'

interface LanguageSwitcherProps {
  className?: string
  position?: 'fixed' | 'inline'
  buttonClassName?: string
}

export default function LanguageSwitcher({
  className = '',
  position = 'fixed',
  buttonClassName = '',
}: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const currentLanguageLabel = currentLang === 'zh' ? '中文' : 'English'

  const toggleLanguage = () => {
    setLanguage(currentLang === 'zh' ? 'en' : 'zh')
  }

  return (
    <div
      className={position === 'fixed'
        ? `fixed right-4 top-4 z-50 ${className}`
        : `relative z-10 ${className}`
      }
    >
      <motion.button
        onClick={toggleLanguage}
        className={`
          flex items-center gap-1.5 rounded-md border px-3 py-1.5
          text-sm font-ui text-ink-medium/90
          border-paper-aged bg-paper-white/80 backdrop-blur-sm
          transition-colors duration-200 hover:border-line-strong hover:bg-paper-cream hover:text-ink-black
          ${buttonClassName}
        `}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        title={`${t('language.switch')}: ${currentLanguageLabel}`}
      >
        <Globe className="w-4 h-4" />
        <span className="hidden md:inline">{currentLanguageLabel}</span>
      </motion.button>
    </div>
  )
}
