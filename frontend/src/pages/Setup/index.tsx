import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings, Key, Globe, Cpu, CheckCircle, Loader2 } from 'lucide-react'

interface SetupConfig {
  aiApiKey: string
  aiBaseUrl: string
  aiModel: string
}

export default function Setup({ onComplete }: { onComplete: (config: SetupConfig) => void }) {
  const [config, setConfig] = useState<SetupConfig>({
    aiApiKey: '',
    aiBaseUrl: 'https://api.openai.com/v1',
    aiModel: 'gpt-4',
  })
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'form' | 'saving' | 'done'>('form')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!config.aiApiKey.trim()) return

    setStep('saving')
    setSaving(true)
    try {
      await onComplete(config)
      setStep('done')
    } catch (err) {
      console.error('Setup failed:', err)
      setStep('form')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper-cream flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ink-black mb-4">
            <span className="text-paper-white font-title text-2xl">墨</span>
          </div>
          <h1 className="text-2xl font-title text-ink-black">Mochat 设置</h1>
          <p className="text-ink-light mt-2">首次使用，请配置 AI 服务</p>
        </div>

        {step === 'form' && (
          <motion.form
            onSubmit={handleSubmit}
            className="bg-paper-white rounded-lg border border-paper-aged p-6 shadow-sm space-y-5"
          >
            {/* API Key */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-ink-black mb-2">
                <Key size={14} />
                API Key <span className="text-vermilion">*</span>
              </label>
              <input
                type="password"
                value={config.aiApiKey}
                onChange={(e) => setConfig({ ...config, aiApiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-paper-aged rounded-md bg-paper-cream text-ink-black placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-ink-black/20"
                required
                autoFocus
              />
              <p className="text-xs text-ink-faint mt-1">
                支持 OpenAI、Gemini 或任何兼容 OpenAI 格式的 API
              </p>
            </div>

            {/* Base URL */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-ink-black mb-2">
                <Globe size={14} />
                API 地址
              </label>
              <input
                type="url"
                value={config.aiBaseUrl}
                onChange={(e) => setConfig({ ...config, aiBaseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 border border-paper-aged rounded-md bg-paper-cream text-ink-black placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-ink-black/20"
              />
            </div>

            {/* Model */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-ink-black mb-2">
                <Cpu size={14} />
                模型
              </label>
              <input
                type="text"
                value={config.aiModel}
                onChange={(e) => setConfig({ ...config, aiModel: e.target.value })}
                placeholder="gpt-4"
                className="w-full px-3 py-2 border border-paper-aged rounded-md bg-paper-cream text-ink-black placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-ink-black/20"
              />
            </div>

            <button
              type="submit"
              disabled={!config.aiApiKey.trim() || saving}
              className="w-full py-2.5 px-4 bg-ink-black text-paper-white rounded-md font-medium hover:bg-ink-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              开始使用
            </button>
          </motion.form>
        )}

        {step === 'saving' && (
          <div className="bg-paper-white rounded-lg border border-paper-aged p-8 text-center">
            <Loader2 className="animate-spin mx-auto mb-4" size={32} />
            <p className="text-ink-medium">正在保存配置并启动服务...</p>
          </div>
        )}

        {step === 'done' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-paper-white rounded-lg border border-paper-aged p-8 text-center"
          >
            <CheckCircle className="mx-auto mb-4 text-green-600" size={32} />
            <p className="text-ink-medium">配置完成，正在加载...</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
