import { InputHTMLAttributes, forwardRef } from 'react'
import { motion } from 'framer-motion'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm text-ink-medium mb-1 font-body">
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
              w-full px-4 py-3 
              ${icon ? 'pl-10' : ''}
              bg-paper-white 
              border-b-2 border-ink-light
              text-ink-black placeholder-ink-faint
              font-body
              focus:outline-none focus:border-ink-black
              transition-colors duration-300
              ${error ? 'border-vermilion' : ''}
              ${className}
            `}
            {...props}
          />
          
          {/* 聚焦时的墨线动画 */}
          <motion.span
            className="absolute bottom-0 left-0 h-0.5 bg-ink-black"
            initial={{ width: '0%' }}
            whileFocus={{ width: '100%' }}
            transition={{ duration: 0.3 }}
          />
        </div>
        
        {error && (
          <motion.p
            className="text-sm text-vermilion mt-1"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
