import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, RotateCcw, Bot, Key, Globe, Cpu } from 'lucide-react'
import Button from '../../../components/common/Button'
import Input from '../../../components/common/Input'

export default function ModelConfig() {
  const [config, setConfig] = useState({
    ai_api_key: '',
    ai_base_url: 'https://api.openai.com/v1',
    ai_model: 'gpt-4',
    max_tokens: '4096',
    temperature: '0.7',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    // 模拟保存
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    setConfig({
      ai_api_key: '',
      ai_base_url: 'https://api.openai.com/v1',
      ai_model: 'gpt-4',
      max_tokens: '4096',
      temperature: '0.7',
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-title text-ink-black">模型配置</h2>

      <motion.div
        className="ink-card p-6 space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* API密钥 */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-black">
            <Key size={16} />
            API 密钥
          </label>
          <Input
            type="password"
            placeholder="输入您的 API 密钥"
            value={config.ai_api_key}
            onChange={(e) => setConfig({ ...config, ai_api_key: e.target.value })}
          />
          <p className="text-xs text-ink-light">
            您的 API 密钥将被安全存储，不会泄露给他人
          </p>
        </div>

        {/* API地址 */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-black">
            <Globe size={16} />
            API 地址
          </label>
          <Input
            placeholder="https://api.openai.com/v1"
            value={config.ai_base_url}
            onChange={(e) => setConfig({ ...config, ai_base_url: e.target.value })}
          />
          <p className="text-xs text-ink-light">
            支持 OpenAI 兼容的 API 地址
          </p>
        </div>

        {/* 模型选择 */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-black">
            <Bot size={16} />
            模型名称
          </label>
          <select
            value={config.ai_model}
            onChange={(e) => setConfig({ ...config, ai_model: e.target.value })}
            className="w-full px-4 py-3 bg-paper-white border-b-2 border-ink-light text-ink-black focus:outline-none focus:border-ink-black transition-colors"
          >
            <option value="gpt-4">GPT-4</option>
            <option value="gpt-4-turbo">GPT-4 Turbo</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            <option value="claude-3-opus">Claude 3 Opus</option>
            <option value="claude-3-sonnet">Claude 3 Sonnet</option>
          </select>
        </div>

        {/* 参数配置 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-black">
              <Cpu size={16} />
              最大令牌数
            </label>
            <Input
              type="number"
              placeholder="4096"
              value={config.max_tokens}
              onChange={(e) => setConfig({ ...config, max_tokens: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-black">
              温度 (Temperature)
            </label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="2"
              placeholder="0.7"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: e.target.value })}
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-4 border-t border-paper-aged">
          <Button onClick={handleSave} loading={saving}>
            <Save size={18} />
            {saved ? '已保存' : '保存配置'}
          </Button>
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw size={18} />
            重置默认
          </Button>
        </div>
      </motion.div>

      {/* 提示信息 */}
      <motion.div
        className="ink-card p-4 bg-paper-cream"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h4 className="font-medium text-ink-black mb-2">💡 配置说明</h4>
        <ul className="text-sm text-ink-medium space-y-1 list-disc list-inside">
          <li>API 密钥：从 OpenAI 或其他 AI 服务商获取</li>
          <li>API 地址：支持 OpenAI 兼容的 API 端点</li>
          <li>温度：较低的值生成更确定的回复，较高的值生成更有创意的回复</li>
          <li>配置修改后需要刷新页面才能生效</li>
        </ul>
      </motion.div>
    </div>
  )
}
