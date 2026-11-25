/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
export type BuiltinProvider = 'bing' | 'duckduckgo' | 'brave' | 'anysearch' | 'tavily' | 'exa' | 'github' | 'huggingface';
/** 用户自己填的 JSON 来源统一挂 custom: 前缀，避免和内置名字撞。 */
export type SearchProvider = BuiltinProvider | `custom:${string}`;
export interface CustomSource {
  /** 名字只作标识与展示：小写字母、数字、下划线、连字符，1–24 位。 */
  name: string;
  /** 请求地址，必须含 {query} 占位；只收 http/https，不跟随跳转。 */
  url: string;
  method: 'GET' | 'POST';
  /** 结果数组的点路径，例如 data.results。 */
  items: string;
  title: string;
  link: string;
  /** 摘要字段，可为空。 */
  snippet: string;
  /** 可选 API Key，放在 Authorization: Bearer。 */
  key: string;
}
export type PublicCustomSource = Omit<CustomSource, 'key'> & { hasKey: boolean };
export type SearchZone = 'cn' | 'intl';
export type ScholarSource = 'arxiv' | 'crossref' | 'openalex' | 'semanticscholar';
export interface SurfConfig {
  searchProviders: SearchProvider[];
  braveApiKey: string;
  tavilyApiKey: string;
  exaApiKey: string;
  anysearchApiKey: string;
  anysearchZone: SearchZone;
  proxyUrl: string;
  timeoutMs: number;
  maxPageBytes: number;
  maxImageBytes: number;
  maxTextChars: number;
  resultsLimit: number;
  referenceTtlSeconds: number;
  concurrency: number;
  /** 学术搜索：默认不注册工具，开关打开后才有 search_scholar。 */
  scholarEnabled: boolean;
  scholarSources: ScholarSource[];
  scholarMailto: string;
  /** 自定义 JSON 来源，只有用户自己加过才有。 */
  customSources: CustomSource[];
}
export type PublicConfig = Omit<SurfConfig, 'braveApiKey' | 'anysearchApiKey' | 'tavilyApiKey' | 'exaApiKey' | 'proxyUrl' | 'customSources'> & {
  searchProvider: SearchProvider;
  customSources: PublicCustomSource[];
  hasBraveApiKey: boolean; hasAnySearchApiKey: boolean; hasTavilyApiKey: boolean; hasExaApiKey: boolean; hasProxy: boolean;
};
export interface FetchOptions {
  signal?: AbortSignal; timeoutMs: number; maxBytes: number;
  headers?: Record<string, string>; proxyUrl?: string; allowRedirects?: boolean;
  /** Only GET and POST are supported; POST bodies are rejected on redirect. */
  method?: 'GET' | 'POST'; body?: string;
}
export interface FetchResult { url: string; status: number; headers: Record<string, string>; body: Buffer }
export interface PublicFetcher {
  get(url: string, options: FetchOptions): Promise<FetchResult>;
  dispose(): void | Promise<void>;
}
export interface WebLink { text: string; url: string }
export interface WebImage { url: string; alt: string }
export interface ParsedPage {
  title: string; text: string; links: WebLink[]; images: WebImage[];
  totalTextChars: number; truncated: boolean; notice?: string;
}
export interface SearchItem { title: string; url: string; snippet: string }
export interface CallOptions { signal?: AbortSignal }
export interface SearchInput {
  query: string; limit?: number;
  /** Vertical search tag (anysearch only, e.g. academic.search). */
  tag?: string;
  /** Region routing (anysearch only). */
  zone?: SearchZone;
  /** Language preference (anysearch only, e.g. zh-CN). */
  language?: string;
  /** Extra required parameters for a vertical tag (anysearch only), e.g. { type: 'cve', value: 'CVE-2024-3094' }. */
  params?: Record<string, string>;
}
export interface ReadInput { url?: string; pageRef?: string; offset?: number }
export interface ImageInput { pageRef: string; imageIndex: number }
export interface SurfStatus {
  version: '1.0.0'; ready: boolean; vision: boolean; gallery: boolean; configValid: boolean;
  searchProvider: SearchProvider; searchProviders: SearchProvider[]; activeRequests: number;
}
export type OperationResult<T> = { status: 'ok'; data: T } | { status: 'error'; error: { code: string; message: string } };
export interface ScholarInput {
  query: string; limit?: number;
  /** 只查其中几个来源，按给定顺序；不传就用设置里的顺序。 */
  sources?: ScholarSource[];
  /** 只看某一年或之后的文献。 */
  yearMin?: number;
}
export interface ScholarItem {
  source: ScholarSource; title: string; authors: string[]; year?: number;
  venue?: string; doi?: string; url?: string; citations?: number; abstract: string;
}
export interface ScholarData {
  source: string; items: ScholarItem[]; untrusted: true; elapsedMs: number;
  fallback?: SearchFailure[];
  notes?: string[];
}
export interface SearchFailure { provider: SearchProvider; elapsedMs: number; code: string; reason: string }
export interface SearchData {
  provider: string; results: SearchItem[]; untrusted: true; elapsedMs: number;
  fallback?: SearchFailure[];
  /** Per-call notes: which sources ignored tag/zone/language, and why. */
  notes?: string[];
}
export interface PageData {
  pageRef: string; url: string; title: string; text: string; offset: number;
  nextOffset?: number; remainingChars: number; truncated: boolean; expiresAt: string;
  links: WebLink[]; images: { index: number; alt: string }[];
  imageToolAvailable: boolean; collectionToolAvailable: boolean; untrusted: true; notice?: string;
}
export interface ImageData { mediaRef: string; expiresAt: string; nextTool: 'vision_view'; state: 'offered' }
export interface GalleryImageData { mediaRef: string; expiresAt: string; nextTool: 'gallery_collect'; state: 'offered' }
/** Trusted backend service only. sessionId must come from ToolSession.id, never model arguments. */
export interface SurfService {
  status(): SurfStatus;
  settings(): PublicConfig;
  search(input: SearchInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<SearchData>>;
  scholar(input: ScholarInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<ScholarData>>;
  read(input: ReadInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<PageData>>;
  image(input: ImageInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<ImageData>>;
  prepareCollection(input: ImageInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<GalleryImageData>>;
}
/** Consumer-side subset of vision's published 1.0.0 contract. */
export interface VisionService {
  offerMedia(input: { sessionId: string; mime: string; base64: string }, options?: CallOptions): Promise<{ mediaRef: string; expiresAt: string; info: unknown }>;
  release(input: { sessionId: string; mediaRef: string }, options?: CallOptions): Promise<{ released: boolean }>;
}
/** Consumer-side subset of gallery's published 1.0.0 contract; offering does not collect. */
export interface GalleryService {
  offerMedia(input: { sessionId: string; base64: string; source?: string }, options?: CallOptions): Promise<{ mediaRef: string; expiresInSeconds: number }>;
}
