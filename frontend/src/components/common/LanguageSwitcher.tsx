import { motion } from 'framer-motion'
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../../i18n'

interface LanguageSwitcherProps {
  className?: string
  position?: 'fixed' | 'inline'
}

export default function LanguageSwitcher({ className = '', position = 'fixed' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const currentLanguageLabel = currentLang === 'zh' ? '中文' : 'English'

  const toggleLanguage = () => {
    setLanguage(currentLang === 'zh' ? 'en' : 'zh')
  }

  return (
    <div
      className={position === 'fixed'
        ? `fixed bottom-6 right-6 z-50 ${className}`
        : `relative z-10 ${className}`
      }
    >
      <motion.button
        onClick={toggleLanguage}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-md
          text-sm text-ink-medium/80 hover:text-ink-black hover:bg-paper-cream
          transition-colors duration-200
        `}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        title={`${t('language.switch')}: ${currentLanguageLabel}`}
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">{currentLanguageLabel}</span>
      </motion.button>
    </div>
  )
}
