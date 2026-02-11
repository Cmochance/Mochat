import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  align?: 'left' | 'center'
  className?: string
}

export default function SectionHeader({
  title,
  subtitle,
  align = 'left',
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`${align === 'center' ? 'text-center' : ''} ${className}`}>
      <h2 className="text-3xl font-title text-ink-black md:text-4xl">{title}</h2>
      {subtitle && (
        <p className={`mt-3 max-w-3xl text-sm font-ui text-text-secondary md:text-base ${align === 'center' ? 'mx-auto' : ''}`}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
