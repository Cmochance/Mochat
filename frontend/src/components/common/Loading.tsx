import { motion } from 'framer-motion'

interface LoadingProps {
  fullScreen?: boolean
  text?: string
}

export default function Loading({ fullScreen = false, text = '墨染中...' }: LoadingProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-4 text-center">
      <div className="relative w-16 h-16">
        <motion.div
          className="absolute inset-0 rounded-full bg-ink-black/90"
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: [0, 1.5], opacity: [0.8, 0] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
        <motion.div
          className="absolute inset-0 rounded-full bg-ink-black"
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: [0, 1.5], opacity: [0.8, 0] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeOut',
            delay: 0.5,
          }}
        />
        <motion.div
          className="absolute inset-0 rounded-full bg-ink-black"
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: [0, 1.5], opacity: [0.8, 0] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeOut',
            delay: 1,
          }}
        />
      </div>
      
      <motion.p
        className="font-ui text-sm text-ink-medium"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {text}
      </motion.p>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas-gradient">
        {content}
      </div>
    )
  }

  return content
}
