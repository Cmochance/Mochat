import { InputHTMLAttributes, ReactNode, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string
  hint?: string
  icon?: ReactNode
  rightSlot?: ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, rightSlot, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="mb-1 block text-sm font-ui text-ink-medium">
            {label}
          </label>
        )}
        
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light">
              {icon}
            </span>
          )}
          
          <input
            ref={ref}
            className={`
              w-full rounded-md border px-4 py-2.5
              ${icon ? 'pl-10' : ''}
              ${rightSlot ? 'pr-10' : ''}
              bg-paper-white border-line-soft
              text-text-primary placeholder:text-text-muted
              font-ui
              focus:outline-none focus:border-line-strong focus:ring-2 focus:ring-ink-dark/10
              transition-colors duration-200
              ${error ? 'border-vermilion focus:border-vermilion focus:ring-vermilion/10' : ''}
              ${className}
            `}
            {...props}
          />
          
          {rightSlot && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-light">
              {rightSlot}
            </span>
          )}
        </div>

        {error && (
          <p className="mt-1 text-sm text-vermilion">
            {error}
          </p>
        )}

        {!error && hint && (
          <p className="mt-1 text-xs text-ink-faint">{hint}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
