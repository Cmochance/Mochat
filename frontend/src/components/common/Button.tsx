import { motion } from 'framer-motion'
import { ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'seal' | 'danger' | 'ink' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  className?: string
}

export default function Button({
  children,
  variant = 'ink',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  onClick,
  type = 'button',
  className = '',
}: ButtonProps) {
  const normalizedVariant = variant === 'ink'
    ? 'primary'
    : variant === 'ghost'
      ? 'outline'
      : variant

  const baseStyles = `
    relative overflow-hidden rounded-md border font-ui
    transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50
  `

  const variants = {
    primary: 'border-ink-black bg-ink-black text-paper-white hover:bg-ink-dark hover:border-ink-dark hover:shadow-ink',
    secondary: 'border-line-soft bg-paper-cream text-text-primary hover:bg-paper-aged/80',
    outline: 'border-line-strong bg-transparent text-text-primary hover:bg-paper-cream/50',
    seal: 'border-accent-seal bg-accent-seal text-paper-white hover:border-vermilion-light hover:bg-vermilion-light hover:shadow-ink',
    danger: 'border-accent-danger bg-accent-danger text-paper-white hover:bg-vermilion-dark hover:border-vermilion-dark',
  }

  const sizes = {
    sm: 'px-3.5 py-2 text-sm',
    md: 'px-4.5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  return (
    <motion.button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`
        ${baseStyles}
        ${variants[normalizedVariant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      whileHover={{ scale: disabled ? 1 : 1.015 }}
      whileTap={{ scale: disabled ? 1 : 0.985 }}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {loading && (
          <motion.span
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        )}
        {children}
      </span>
    </motion.button>
  )
}
