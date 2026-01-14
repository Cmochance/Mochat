import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw, Bot, GripVertical } from 'lucide-react'
import Button from '../../../components/common/Button'
import Input from '../../../components/common/Input'
import { adminService } from '../../../services/adminService'
import { chatService } from '../../../services/chatService'

interface AllowedModel {
  id: number
  model_id: string
  display_name: string | null
  is_active: boolean
  sort_order: number
  created_at: string | null
}

interface AvailableModel {
  id: string
  name: string
  owned_by?: string | null
}

export default function ModelManagement() {
  const [allowedModels, setAllowedModels] = useState<AllowedModel[]>([])
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [loading, setLoading] = useState(true)
  const [newModelId, setNewModelId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
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
      setLoading(false)
    }
  }

  const handleAdd = async () => {
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
      alert('添加失败，模型可能已存在')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个模型吗？')) return
    
    try {
      await adminService.deleteAllowedModel(id)
      setAllowedModels(allowedModels.filter(m => m.id !== id))
    } catch (error) {
      console.error('删除模型失败:', error)
    }
  }

  const handleToggle = async (id: number) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-title text-ink-black">模型管理</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={loadData} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus size={18} />
            添加模型
          </Button>
        </div>
      </div>

      {/* 添加模型表单 */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ink-card p-6 overflow-hidden"
          >
            <h3 className="text-lg font-medium text-ink-black mb-4">添加新模型</h3>
            
            {/* 从可用模型中选择 */}
            {unaddedModels.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm text-ink-medium mb-2">从可用模型中选择：</label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-paper-cream rounded">
                  {unaddedModels.map(model => (
                    <button
                      key={model.id}
                      onClick={() => setNewModelId(model.id)}
                      className={`
                        px-3 py-1.5 text-sm rounded-sm transition-colors
                        ${newModelId === model.id
                          ? 'bg-ink-black text-paper-white'
                          : 'bg-paper-white border border-paper-aged hover:bg-paper-aged'
                        }
                      `}
                    >
                      {getModelDisplayName(model.id)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-ink-medium mb-2">模型 ID：</label>
                <Input
                  placeholder="例如：gpt-4 或 claude-3-opus"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-ink-medium mb-2">显示名称（可选）：</label>
                <Input
                  placeholder="自定义显示名称"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAdd} loading={adding} disabled={!newModelId.trim()}>
                确认添加
              </Button>
              <Button variant="ghost" onClick={() => {
                setShowAddForm(false)
                setNewModelId('')
                setNewDisplayName('')
              }}>
                取消
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 模型列表 */}
      <motion.div
        className="ink-card overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {loading ? (
          <div className="p-8 text-center text-ink-light">加载中...</div>
        ) : allowedModels.length === 0 ? (
          <div className="p-8 text-center">
            <Bot size={48} className="mx-auto mb-4 text-ink-faint" />
            <p className="text-ink-light mb-2">暂未配置任何模型</p>
            <p className="text-sm text-ink-faint">未配置时将显示所有可用模型</p>
          </div>
        ) : (
          <div className="divide-y divide-paper-aged">
            {allowedModels.map((model, index) => (
              <motion.div
                key={model.id}
                className="p-4 flex items-center gap-4 hover:bg-paper-cream/50 transition-colors"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="text-ink-faint cursor-move">
                  <GripVertical size={18} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${model.is_active ? 'text-ink-black' : 'text-ink-faint line-through'}`}>
                      {model.display_name || getModelDisplayName(model.model_id)}
                    </span>
                    {!model.is_active && (
                      <span className="text-xs px-2 py-0.5 bg-paper-aged text-ink-light rounded">
                        已禁用
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-ink-light truncate" title={model.model_id}>
                    {model.model_id}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(model.id)}
                    className={`p-2 rounded transition-colors ${
                      model.is_active
                        ? 'text-jade hover:bg-jade/10'
                        : 'text-ink-faint hover:bg-paper-aged'
                    }`}
                    title={model.is_active ? '点击禁用' : '点击启用'}
                  >
                    {model.is_active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>

                  <button
                    onClick={() => handleDelete(model.id)}
                    className="p-2 text-ink-faint hover:text-vermilion hover:bg-vermilion/10 rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* 说明 */}
      <motion.div
        className="ink-card p-4 bg-paper-cream"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h4 className="font-medium text-ink-black mb-2">💡 使用说明</h4>
        <ul className="text-sm text-ink-medium space-y-1 list-disc list-inside">
          <li>添加的模型将显示在用户的模型选择列表中</li>
          <li>可以为模型设置自定义显示名称</li>
          <li>禁用的模型不会显示在用户的选择列表中</li>
          <li>如果未配置任何模型，将显示 API 提供的所有模型</li>
        </ul>
      </motion.div>
    </div>
  )
}
