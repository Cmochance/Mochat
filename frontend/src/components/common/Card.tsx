import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  elevated?: boolean
}

export default function Card({ children, className = '', elevated = false }: CardProps) {
  return (
    <div
      className={`rounded-lg border p-5 ${elevated ? 'shadow-panel' : 'shadow-sm'} ${className}`}
      style={{
        background: 'linear-gradient(180deg, var(--bg-elevated) 0%, #f7f1e7 100%)',
        borderColor: 'var(--line-soft)',
      }}
    >
      {children}
    </div>
  )
}
