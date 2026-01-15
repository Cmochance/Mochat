/**
 * Picgenerate 模块类型定义
 */

// 生成请求参数
export interface GenerateOptions {
  prompt: string
  size?: '1024x1024' | '1792x1024' | '1024x1792'
  quality?: 'standard' | 'hd'
  userId?: string
}

// 流式响应块
export interface StreamChunk {
  type: 'thinking' | 'content' | 'error' | 'done'
  data?: string | GenerateResultData
}

// 生成结果数据
export interface GenerateResultData {
  success: boolean
  image_url?: string
  english_prompt?: string
}

// 生成结果
export interface GenerateResult {
  success: boolean
  imageUrl?: string
  englishPrompt?: string
  error?: string
}

// 模块配置
export interface PicgenConfig {
  apiBasePath?: string
}
