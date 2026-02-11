import type { ReactNode } from 'react'

type BadgeVariant = 'neutral' | 'info' | 'seal' | 'success' | 'danger'

interface BadgeProps {
  children: ReactNode
  className?: string
  variant?: BadgeVariant
}

const variantClass: Record<BadgeVariant, string> = {
  neutral: 'bg-paper-cream text-ink-medium',
  info: 'bg-cyan-ink/15 text-cyan-ink',
  seal: 'bg-vermilion/15 text-vermilion',
  success: 'bg-jade/15 text-jade',
  danger: 'bg-vermilion/15 text-vermilion',
}

export default function Badge({ children, className = '', variant = 'neutral' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-ui ${variantClass[variant]} ${className}`}>
      {children}
    </span>
  )
}
