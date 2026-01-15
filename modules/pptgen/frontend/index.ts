/**
 * PPT 生成模块导出入口
 */

// 导出类型
export type {
  PPTGenerateRequest,
  PPTGenerateResult,
  PPTGenerateStreamChunk,
  UsePPTGenerateConfig,
  UsePPTGenerateReturn,
} from './types';

// 导出 Hook
export { usePPTGenerate } from './usePPTGenerate';
