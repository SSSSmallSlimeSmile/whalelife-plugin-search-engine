/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
export const messages = {
  invalid_input: '参数无效。', unsafe_url: '只允许访问公开 HTTP(S) 地址。',
  network_error: '网络访问失败；未自动重试。', timeout: '请求超时。', cancelled: '请求已取消。',
  stopped: '插件已停止。', too_large: '内容超过大小限制。', too_many_redirects: '重定向次数超过限制。',
  access_blocked: '来源要求验证、登录或限制访问；未绕过限制。', http_error: '来源未返回成功响应。',
  unsupported_content: '首版只支持 HTML、纯文字和图片，不执行网页脚本或读取视频。',
  search_empty: '来源返回零条结果。', search_exhausted: '配置的搜索来源均未返回有效结果。',
  source_cooling: '来源刚连续失败过，冷却中，这次跳过。',
  search_parse: '未能识别搜索结果，来源页面可能已变化。', search_unconfigured: '所选搜索服务尚未配置。',
  page_unavailable: '页面引用不可用，请在当前会话重新读取。', session_required: '缺少可信当前会话。',
  vision_unavailable: '视觉服务不可用；文字阅读仍可使用。', gallery_unavailable: '图库服务不可用；文字阅读和已有看图能力仍可使用。',
  image_unavailable: '未能准备图片，请稍后重新选择。',
  busy: '当前浏览请求已满，请等待已发起的请求完成。', config_invalid: '配置无效。',
  config_conflict: '配置已被其他页面修改，请刷新后再保存。', host_required: '宿主缺少临时工具接口，请升级宿主。',
} as const;
export type ErrorCode = keyof typeof messages;
export class SurfError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) { super(messages[code]); this.name = 'SurfError'; this.code = code; }
}
/** 来源自己说清了原因（例如缺哪个垂直参数）：带上过滤后的原话，便于回退链里看出差别。 */
export class ProviderError extends SurfError {
  constructor(code: ErrorCode, detail: string) { super(code); if (detail) this.message += ' ' + detail; }
}
export class SearchExhaustedError extends SurfError {
  constructor(code: ErrorCode, details: string) {
    super(code);
    this.message += ' ' + details;
  }
}
export function safeError(error: unknown): { code: ErrorCode; message: string } {
  const code = error instanceof SurfError ? error.code : 'network_error';
  // 子类可以把补充说明接在固定文案后面；底层文案仍来自本地常量表。
  return { code, message: error instanceof SurfError ? error.message : messages[code] };
}
