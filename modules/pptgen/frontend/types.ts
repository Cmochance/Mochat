/**
 * PPT 生成模块类型定义
 */

// 生成请求参数
export interface PPTGenerateRequest {
  prompt: string;
  userId?: string;
}

// 生成结果
export interface PPTGenerateResult {
  success: boolean;
  pptUrl?: string;
  title?: string;
  error?: string;
}

// 流式数据块
export interface PPTGenerateStreamChunk {
  type: 'thinking' | 'content' | 'error' | 'done';
  data: string | PPTGenerateResult;
}

// Hook 配置
export interface UsePPTGenerateConfig {
  apiBase?: string;
  userId?: string;
}

// Hook 返回值
export interface UsePPTGenerateReturn {
  generatePPT: (
    request: PPTGenerateRequest,
    onThinking?: (chunk: string) => void
  ) => Promise<PPTGenerateResult>;
  isGenerating: boolean;
  reset: () => void;
}
