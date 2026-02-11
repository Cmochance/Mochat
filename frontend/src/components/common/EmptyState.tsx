import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export default function EmptyState({ icon, title, description, actions, className = '' }: EmptyStateProps) {
  return (
    <div className={`rounded-lg border border-line-soft bg-paper-white/80 px-6 py-10 text-center ${className}`}>
      {icon && (
        <div className="mb-4 flex justify-center text-ink-light">{icon}</div>
      )}
      <h3 className="text-xl font-title text-ink-black">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-2xl text-sm font-ui text-text-secondary">{description}</p>
      )}
      {actions && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      )}
    </div>
  )
}
