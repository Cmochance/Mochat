import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Save, RotateCcw, Bot, Key, Globe, 
  Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw, GripVertical,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../../components/common/Button'
import Input from '../../../components/common/Input'
import { adminService, type AllowedModel } from '../../../services/adminService'
import { chatService } from '../../../services/chatService'

interface AvailableModel {
  id: string
  name: string
  owned_by?: string | null
}

export default function ModelConfig() {
  const { t } = useTranslation()
  
  // 系统配置状态
  const [config, setConfig] = useState({
    ai_api_key: '',
    ai_base_url: '',
    ai_model: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // 模型管理状态
  const [allowedModels, setAllowedModels] = useState<AllowedModel[]>([])
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [newModelId, setNewModelId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showModelList, setShowModelList] = useState(true)

  // 加载配置
  useEffect(() => {
    loadConfig()
    loadModels()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const configs = await adminService.getConfigs()
      setConfig(prev => ({
        ...prev,
        ai_api_key: configs.ai_api_key || '',
        ai_base_url: configs.ai_base_url || '',
        ai_model: configs.ai_model || '',
      }))
    } catch (error) {
      console.error('加载配置失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadModels = async () => {
    setModelsLoading(true)
    try {
      const [allowed, available] = await Promise.all([
        adminService.getAllowedModels(),
        chatService.getModels(),
      ])
      setAllowedModels(allowed)
      setAvailableModels(available.models)
    } catch (error) {
      console.error('加载模型数据失败:', error)
    } finally {
      setModelsLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // 保存各项配置
      const configsToSave = [
        { key: 'ai_api_key', value: config.ai_api_key },
        { key: 'ai_base_url', value: config.ai_base_url },
        { key: 'ai_model', value: config.ai_model },
      ]

      for (const { key, value } of configsToSave) {
        if (value) {
          await adminService.setConfig(key, value)
        }
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error('保存配置失败:', error)
      alert(t('admin.config.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setConfig({
      ai_api_key: '',
      ai_base_url: 'https://api.openai.com/v1',
      ai_model: 'gpt-4',
    })
  }

  // 模型管理函数
  const handleAddModel = async () => {
    if (!newModelId.trim()) return
    
    setAdding(true)
    try {
      const model = await adminService.addAllowedModel(
        newModelId.trim(),
        newDisplayName.trim() || undefined
      )
      setAllowedModels([...allowedModels, model])
      setNewModelId('')
      setNewDisplayName('')
      setShowAddForm(false)
    } catch (error) {
      console.error('添加模型失败:', error)
      alert(t('admin.config.addFailed'))
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteModel = async (id: number) => {
    if (!confirm(t('admin.config.confirmDeleteModel'))) return
    
    try {
      await adminService.deleteAllowedModel(id)
      setAllowedModels(allowedModels.filter(m => m.id !== id))
    } catch (error) {
      console.error('删除模型失败:', error)
    }
  }

  const handleToggleModel = async (id: number) => {
    try {
      const updated = await adminService.toggleModelStatus(id)
      setAllowedModels(allowedModels.map(m => m.id === id ? updated : m))
    } catch (error) {
      console.error('切换状态失败:', error)
    }
  }

  // 获取未添加的可用模型
  const unaddedModels = availableModels.filter(
    m => !allowedModels.some(am => am.model_id === m.id)
  )

  // 简化显示模型名称
  const getModelDisplayName = (modelId: string) => {
    const parts = modelId.split('/')
    return parts[parts.length - 1]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-ink-light" size={32} />
      </div>
    )
  }

  const configNotes = t('admin.config.notes', { returnObjects: true }) as string[]

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-title text-ink-black">{t('admin.config.title')}</h2>

      {/* API 配置区域 */}
      <motion.div
        className="ink-card p-6 space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-lg font-medium text-ink-black border-b border-paper-aged pb-2">
          {t('admin.config.apiConfig')}
        </h3>

        {/* API密钥 */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-black">
            <Key size={16} />
            {t('admin.config.apiKey')}
          </label>
          <Input
            type="password"
            placeholder={t('admin.config.apiKeyPlaceholder')}
            value={config.ai_api_key}
            onChange={(e) => setConfig({ ...config, ai_api_key: e.target.value })}
          />
          <p className="text-xs text-ink-light">
            {t('admin.config.apiKeyHint')}
          </p>
        </div>

        {/* API地址 */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-black">
            <Globe size={16} />
            {t('admin.config.apiUrl')}
          </label>
          <Input
            placeholder="https://api.openai.com/v1"
            value={config.ai_base_url}
            onChange={(e) => setConfig({ ...config, ai_base_url: e.target.value })}
          />
          <p className="text-xs text-ink-light">
            {t('admin.config.apiUrlHint')}
          </p>
        </div>

        {/* 默认模型 */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-black">
            <Bot size={16} />
            {t('admin.config.defaultModel')}
          </label>
          <Input
            placeholder={t('admin.config.defaultModelPlaceholder')}
            value={config.ai_model}
            onChange={(e) => setConfig({ ...config, ai_model: e.target.value })}
          />
          <p className="text-xs text-ink-light">
            {t('admin.config.defaultModelHint')}
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-4 border-t border-paper-aged">
          <Button onClick={handleSave} loading={saving}>
            <Save size={18} />
            {saved ? t('common.saved') : t('admin.config.saveConfig')}
          </Button>
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw size={18} />
            {t('admin.config.resetDefault')}
          </Button>
        </div>
      </motion.div>

      {/* 模型管理区域 */}
      <motion.div
        className="ink-card overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* 标题栏 */}
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-paper-cream/50 transition-colors"
          onClick={() => setShowModelList(!showModelList)}
        >
          <h3 className="text-lg font-medium text-ink-black flex items-center gap-2">
            <Bot size={20} />
            {t('admin.config.modelManagement')}
            <span className="text-sm text-ink-light font-normal">
              ({allowedModels.length} {t('admin.config.modelsConfigured')})
            </span>
          </h3>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              onClick={loadModels} 
              disabled={modelsLoading}
            >
              <RefreshCw size={16} className={modelsLoading ? 'animate-spin' : ''} />
            </Button>
            <Button onClick={() => setShowAddForm(!showAddForm)}>
              <Plus size={16} />
              {t('common.add')}
            </Button>
            {showModelList ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>

        <AnimatePresence>
          {showModelList && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {/* 添加模型表单 */}
              <AnimatePresence>
                {showAddForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 bg-paper-cream border-y border-paper-aged overflow-hidden"
                  >
                    <h4 className="text-sm font-medium text-ink-black mb-3">{t('admin.config.addNewModel')}</h4>
                    
                    {/* 从可用模型中选择 */}
                    {unaddedModels.length > 0 && (
                      <div className="mb-3">
                        <label className="block text-xs text-ink-medium mb-2">{t('admin.config.selectFromAvailable')}</label>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-paper-white rounded">
                          {unaddedModels.map(model => (
                            <button
                              key={model.id}
                              onClick={() => setNewModelId(model.id)}
                              className={`
                                px-2 py-1 text-xs rounded-sm transition-colors
                                ${newModelId === model.id
                                  ? 'bg-ink-black text-paper-white'
                                  : 'bg-paper-cream border border-paper-aged hover:bg-paper-aged'
                                }
                              `}
                            >
                              {getModelDisplayName(model.id)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-ink-medium mb-1">{t('admin.config.modelId')}</label>
                        <Input
                          placeholder={t('admin.config.modelIdPlaceholder')}
                          value={newModelId}
                          onChange={(e) => setNewModelId(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-ink-medium mb-1">{t('admin.config.displayName')}</label>
                        <Input
                          placeholder={t('admin.config.displayNamePlaceholder')}
                          value={newDisplayName}
                          onChange={(e) => setNewDisplayName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleAddModel} loading={adding} disabled={!newModelId.trim()}>
                        {t('admin.config.confirmAdd')}
                      </Button>
                      <Button variant="ghost" onClick={() => {
                        setShowAddForm(false)
                        setNewModelId('')
                        setNewDisplayName('')
                      }}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 模型列表 */}
              {modelsLoading ? (
                <div className="p-6 text-center text-ink-light">{t('common.loading')}</div>
              ) : allowedModels.length === 0 ? (
                <div className="p-6 text-center">
                  <Bot size={40} className="mx-auto mb-3 text-ink-faint" />
                  <p className="text-ink-light text-sm mb-1">{t('admin.config.noModelsConfigured')}</p>
                  <p className="text-xs text-ink-faint">{t('admin.config.noModelsHint')}</p>
                </div>
              ) : (
                <div className="divide-y divide-paper-aged">
                  {allowedModels.map((model, index) => (
                    <motion.div
                      key={model.id}
                      className="p-3 flex items-center gap-3 hover:bg-paper-cream/50 transition-colors"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <div className="text-ink-faint cursor-move">
                        <GripVertical size={16} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${model.is_active ? 'text-ink-black' : 'text-ink-faint line-through'}`}>
                            {model.display_name || getModelDisplayName(model.model_id)}
                          </span>
                          {!model.is_active && (
                            <span className="text-xs px-1.5 py-0.5 bg-paper-aged text-ink-light rounded">
                              {t('common.disabled')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ink-light truncate" title={model.model_id}>
                          {model.model_id}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleModel(model.id)}
                          className={`p-1.5 rounded transition-colors ${
                            model.is_active
                              ? 'text-jade hover:bg-jade/10'
                              : 'text-ink-faint hover:bg-paper-aged'
                          }`}
                          title={model.is_active ? t('admin.config.clickToDisable') : t('admin.config.clickToEnable')}
                        >
                          {model.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        </button>

                        <button
                          onClick={() => handleDeleteModel(model.id)}
                          className="p-1.5 text-ink-faint hover:text-vermilion hover:bg-vermilion/10 rounded transition-colors"
                          title={t('common.delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 提示信息 */}
      <motion.div
        className="ink-card p-4 bg-paper-cream"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h4 className="font-medium text-ink-black mb-2">{t('admin.config.configNotes')}</h4>
        <ul className="text-sm text-ink-medium space-y-1 list-disc list-inside">
          {configNotes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      </motion.div>
    </div>
  )
}
