/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
export type BuiltinProvider = 'duckduckgo' | 'brave' | 'anysearch' | 'tavily' | 'exa';
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
export type ScholarSource = 'arxiv' | 'crossref' | 'openalex' | 'semanticscholar' | 'europepmc' | `custom:${string}`;
export interface SurfConfig {
  /**
   * fallback（默认）：一条有序链，前一家失败才换下一家，拿到结果就停。
   * aggregate：并发打链上所有来源，各自成段原样列出，不排序、不合并。
   * hybrid：同样并发出全部来源，但链上首位是“主”。主失败或零条时，主位按链顺序顺延到
   *         下一个有结果的来源——不再发请求，结果本来就在手上，只是“谁代表这次搜索”变了。
   */
  searchMode: 'fallback' | 'aggregate' | 'hybrid';
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
  /**
   * 每个来源自己的二级：它没拿到结果（失败，或连上但零条）时改用这一家。
   * 只顶一层——顶上的那家自己不再触发它的二级，免得绕成环。
   */
  providerFallbacks: Record<string, string>;
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
  /** 聚合模式下一批并发打几家（1–5）。链上还有来源时，去重后条目不够 limit 再补下一家。 */
  aggregateConcurrency: number;
  /** 每个来源的权重 1–5，只决定分多少字，不决定排序。没配过：一级 3、二级 1。 */
  providerWeights: Record<string, number>;
  /** 每个来源的级别：1 = 一级（可设回退、权重高），2 = 二级（免费兜底、不设回退）。没配过算 1。 */
  providerTiers: Record<string, 1 | 2>;
  /** 学术搜索：默认不注册工具，开关打开后才有 search_scholar。 */
  scholarEnabled: boolean;
  scholarSources: ScholarSource[];
  scholarMailto: string;
  /** Semantic Scholar 的 API Key；不填是匿名模式，配额极低、几乎每次 429。 */
  semanticScholarApiKey: string;
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
export type PublicConfig = Omit<SurfConfig, 'braveApiKey' | 'anysearchApiKey' | 'tavilyApiKey' | 'exaApiKey' | 'proxyUrl' | 'semanticScholarApiKey' | 'customSources' | 'scholarCustomSources' | 'factsCustomSources'> & {
  searchProvider: SearchProvider;
  customSources: PublicCustomSource[];
  scholarCustomSources: PublicCustomSource[];
  factsCustomSources: PublicCustomSource[];
  hasBraveApiKey: boolean; hasAnySearchApiKey: boolean; hasTavilyApiKey: boolean; hasExaApiKey: boolean; hasProxy: boolean; hasSemanticScholarApiKey: boolean;
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
  /** 翻页：传上一次回执里的 setId，从那份结果集里取下一批，不发网络请求。 */
  more?: string;
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
  /** 聚合模式：这一篇在前面某一家已经出现过（同 DOI 或同标题），值是最先给出它的来源。 */
  dupOf?: string;
}
/** 学术聚合下一家来源的那一段。不排序，按来源链顺序原样列出。 */
export interface ScholarGroup {
  source: string;
  elapsedMs: number;
  items: ScholarItem[];
  /** 这一家在去重与裁剪之前原始返回了多少条。 */
  returned?: number;
  /** 这一段最后展示了几条（裁完之后）。 */
  shown?: number;
  /** 这一段里有几条是别家也给出的（同 DOI 或同标题）。跟 returned 比就是重合率。 */
  shared?: number;
  /** 这一段里因总量上限被丢掉的条目数。 */
  truncated?: number;
  /** 这一段分到的字符份额（按家数均分，不按一级/二级权重切）。 */
  budgetChars?: number;
  error?: { code: string; reason: string };
  /** 冷却中被跳过，没发请求。 */
  skipped?: string;
}
export interface ScholarData {
  source: string; items: ScholarItem[]; untrusted: true; elapsedMs: number;
  /** 聚合模式下各家来源的那一段；items 留空，免得同一批文献在回执里出现两遍。 */
  groups?: ScholarGroup[];
  /** 聚合模式：被两家以上来源给出的同一篇（同 DOI 或同标题）有几条。 */
  overlap?: number;
  mode?: 'fallback' | 'aggregate';
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
  /** 这一家在去重与裁剪之前原始返回了多少条。 */
  returned?: number;
  /** 这一段最后展示了几条（裁完之后）。 */
  shown?: number;
  /** 这一段里有几条是别家也给出的（标了 dupOf）。跟 returned 比就是重合率。 */
  shared?: number;
  /** 这一段里 api / html / custom 各几条。 */
  viaMix?: Partial<Record<SourceKind, number>>;
  /** 这一段里因总量上限被丢掉的条目数。 */
  truncated?: number;
  /** 这一段分到的权重与字符份额（预算按权重切）。 */
  weight?: number;
  budgetChars?: number;
  /** 这家失败了：code 与原因都在这里，不抛到整次调用外。 */
  error?: { code: string; reason: string };
  /** 冷却中被跳过，没发请求。 */
  skipped?: string;
  /**
   * 这家自己没拿到结果、改用二级顶上时记在这里；此时 results 是二级给的。
   * reason 是原来那家为什么没顶上；error 是二级自己也失败时的原因。
   */
  standby?: { provider: string; elapsedMs: number; reason: string; error?: { code: string; reason: string } };
}

export interface SearchFailure { provider: SearchProvider; elapsedMs: number; code: string; reason: string }

export interface SearchData {
  provider: string; results: SearchItem[]; untrusted: true; elapsedMs: number;
  /** 聚合模式下这一轮真的并发打了几家（含失败与被跳过的）。 */
  groups?: AggregateGroup[];
  /** 聚合模式：被两家以上来源给出的同一个 URL 有几个。全一样就说明聚合白花了钱。 */
  overlap?: number;
  /** hybrid：这次代表整轮搜索的是哪一家。首位成功时就是首位本身。 */
  primary?: string;
  /** hybrid：主位顺延过——排在前面的几家各自为什么没顶上。首位成功时不出现这个字段。 */
  primaryFallback?: SearchFailure[];
  mode?: 'fallback' | 'aggregate' | 'hybrid';
  /** 采用的那家来源属于哪一类；见 SearchItem.via。 */
  sourceKind?: SourceKind;
  /** 因总量上限被丢掉的条目数；没丢就不出现这个字段。 */
  truncated?: number;
  /**
   * 这一轮结果集的编号。想往后翻页时把它传回 search_web 的 more：
   * 翻页不发请求，直接从这份结果集里取还没给过的条目。
   */
  setId?: string;
  /** 这次给了几条；配合 available 看得还剩多少。 */
  shown?: number;
  /** 结果集里一共有几条（跨来源去重后的）。 */
  available?: number;
  /** 结果集里还有没给出的条目。 */
  hasMore?: boolean;
  /** 翻页时：这一批从第几条开始（从 0 数）。 */
  pageStart?: number;
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
