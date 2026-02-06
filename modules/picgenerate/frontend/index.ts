/**
 * Picgenerate 模块 - AI 图像生成
 * 
 * 使用方式：
 * 
 * ```tsx
 * import { useImageGenerate, ImageGeneratePanel } from '@picgenerate'
 * 
 * // 方式 1: 使用 Hook（推荐用于集成到聊天）
 * function MyComponent() {
 *   const { generate, isGenerating, thinking, result } = useImageGenerate()
 *   
 *   const handleGenerate = async () => {
 *     const result = await generate(
 *       { prompt: '一只可爱的猫咪' },
 *       (thinkingChunk) => console.log('thinking:', thinkingChunk)
 *     )
 *     if (result.success) {
 *       console.log('图像地址:', result.imageUrl)
 *     }
 *   }
 * }
 * 
 * // 方式 2: 使用面板组件（独立页面）
 * function App() {
 *   return (
 *     <ImageGeneratePanel
 *       onImageGenerated={(url, englishPrompt) => console.log('生成完成:', url)}
 *     />
 *   )
 * }
 * ```
 */

export { useImageGenerate } from './useImageGenerate'
export { ImageGeneratePanel } from './ImageGeneratePanel'
export type { 
  GenerateOptions, 
  GenerateResult, 
  PicgenConfig,
  StreamChunk,
  GenerateResultData,
} from './types'
