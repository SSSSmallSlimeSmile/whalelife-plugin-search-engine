/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
export type BuiltinProvider = 'duckduckgo' | 'brave' | 'anysearch' | 'tavily' | 'exa' | 'github' | 'huggingface';
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
  /** 学术自定义来源专用：作者、年份的点路径，可为空。网页与事实来源忽略这两项。 */
  authors?: string;
  year?: string;
}
export type PublicCustomSource = Omit<CustomSource, 'key'> & { hasKey: boolean };
export type SearchZone = 'cn' | 'intl';
export type ScholarSource = 'arxiv' | 'crossref' | 'openalex' | 'semanticscholar' | `custom:${string}`;
export interface SurfConfig {
  /**
   * fallback（默认）：一条有序链，前一家失败才换下一家，拿到结果就停。
   * aggregate：并发打链上所有来源，各自成段原样列出，不排序、不合并。
   */
  searchMode: 'fallback' | 'aggregate';
  searchProviders: SearchProvider[];
  braveApiKey: string;
  tavilyApiKey: string;
  exaApiKey: string;
  anysearchApiKey: string;
  anysearchZone: SearchZone;
  proxyUrl: string;
  timeoutMs: number;
  /** 每个来源单独的上限（毫秒）。没写的来源按整体预算分配。 */
  sourceTimeouts: Record<string, number>;
  /** 成功结果的缓存秒数，0 = 不缓存。三种搜索共用这个值。 */
  cacheSeconds: number;
  sourceFailThreshold: number;
  sourceCooldownSeconds: number;
  maxPageBytes: number;
  maxImageBytes: number;
  maxTextChars: number;
  /** 命中 GitHub / Stack Exchange / arXiv / 维基百科时改走公开 API 取结构化字段，失败回落页面抓取。 */
  structuredRead: boolean;
  resultsLimit: number;
  /** 单次网页搜索结果的总字符上限（按序列化长度算），0 = 不限。摘要一千字一条，十条就是一万字进上下文。 */
  resultsMaxChars: number;
  referenceTtlSeconds: number;
  concurrency: number;
  /** 学术搜索：默认不注册工具，开关打开后才有 search_scholar。 */
  scholarEnabled: boolean;
  scholarSources: ScholarSource[];
  scholarMailto: string;
  /** 事实查询（维基/维基数据/OpenLibrary/OEIS）：同样默认不注册工具。 */
  factsEnabled: boolean;
  factsSources: FactSource[];
  factsLang: 'zh' | 'en';
  /** 自定义 JSON 来源，只有用户自己加过才有。 */
  customSources: CustomSource[];
  /** 学术页的自定义来源；名字以 custom: 前缀出现在 scholarSources 里。 */
  scholarCustomSources: CustomSource[];
  /** 事实页的自定义来源；同上。 */
  factsCustomSources: CustomSource[];
}
export type PublicConfig = Omit<SurfConfig, 'braveApiKey' | 'anysearchApiKey' | 'tavilyApiKey' | 'exaApiKey' | 'proxyUrl' | 'customSources' | 'scholarCustomSources' | 'factsCustomSources'> & {
  searchProvider: SearchProvider;
  customSources: PublicCustomSource[];
  scholarCustomSources: PublicCustomSource[];
  factsCustomSources: PublicCustomSource[];
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
export type SourceKind = 'api' | 'html' | 'custom';
export interface SearchItem {
  title: string; url: string; snippet: string;
  /** 这条结果是怎么来的：api（官方 JSON 接口）/ html（解析对方页面）/ custom（自定义来源）。 */
  via?: SourceKind;
  /** 链接的主机名，去掉 www.；URL 解析失败时不出现。用来核对条目域名跟它自称的机构是否一致。 */
  domain?: string;
  /** 聚合模式：这条 URL 在前面某一家已经出现过，值是最先给出它的那家。 */
  dupOf?: string;
}
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
  cached?: boolean; cachedAgoMs?: number;
}
export type FactSource = 'wikipedia' | 'wikidata' | 'openlibrary' | 'oeis' | `custom:${string}`;
export interface FactInput {
  query: string; limit?: number;
  /** 只查其中几个来源，按给定顺序；不传就用设置里的顺序。 */
  sources?: FactSource[];
  /** 维基语言：zh / en，不传按设置里的 zone 决定。 */
  lang?: 'zh' | 'en';
}
export interface FactItem {
  source: FactSource; title: string; url: string; snippet: string; meta?: string;
}
export interface FactFailure { source: FactSource; elapsedMs: number; code: string; reason: string }
export interface FactData {
  source: string; items: FactItem[]; untrusted: true; elapsedMs: number;
  fallback?: FactFailure[];
  notes?: string[];
  cached?: boolean; cachedAgoMs?: number;
}
/** 聚合模式下一家来源的那一段。不排序，按来源顺序原样列出，谁先谁后由配置里的链决定。 */
export interface AggregateGroup {
  provider: string;
  sourceKind?: SourceKind;
  elapsedMs: number;
  results: SearchItem[];
  /** 这一段里因总量上限被丢掉的条目数。 */
  truncated?: number;
  /** 这家失败了：code 与原因都在这里，不抛到整次调用外。 */
  error?: { code: string; reason: string };
  /** 冷却中被跳过，没发请求。 */
  skipped?: string;
}

export interface SearchFailure { provider: SearchProvider; elapsedMs: number; code: string; reason: string }

export interface SearchData {
  provider: string; results: SearchItem[]; untrusted: true; elapsedMs: number;
  /** 聚合模式下这一轮真的并发打了几家（含失败与被跳过的）。 */
  groups?: AggregateGroup[];
  /** 聚合模式：被两家以上来源给出的同一个 URL 有几个。全一样就说明聚合白花了钱。 */
  overlap?: number;
  mode?: 'fallback' | 'aggregate';
  /** 采用的那家来源属于哪一类；见 SearchItem.via。 */
  sourceKind?: SourceKind;
  /** 因总量上限被丢掉的条目数；没丢就不出现这个字段。 */
  truncated?: number;
  fallback?: SearchFailure[];
  /** Per-call notes: which sources ignored tag/zone/language, and why. */
  notes?: string[];
  /** 命中缓存时带这两项：这次没发请求，结果是 N 毫秒前那次拿到的。 */
  cached?: boolean; cachedAgoMs?: number;
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
  facts(input: FactInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<FactData>>;
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
