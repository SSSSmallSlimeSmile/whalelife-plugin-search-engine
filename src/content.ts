/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import { load, loadBuffer, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import ipaddr from 'ipaddr.js';
import { SurfError } from './errors.ts';
import type { ParsedPage, SearchItem, WebImage, WebLink } from './types.ts';

const MAX_URL = 4096;
const BLOCKS = new Set(['address', 'article', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'main', 'ol', 'p', 'pre', 'section', 'table', 'tr', 'ul']);
const OMIT = 'script,style,noscript,template,nav,footer,aside,form,input,button,select,textarea,iframe,object,embed,svg,canvas,video,audio,source,[hidden],[inert],[aria-hidden="true"]';

function clipped(value: string, maximum: number): string {
  let text = value.slice(0, maximum);
  if (text.length && /[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return text;
}

function tidy(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\t \u00A0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Iterative traversal keeps deeply nested, untrusted markup off the JS call stack. */
function textOf(nodes: AnyNode[]): string {
  const pending: (AnyNode | string)[] = [...nodes].reverse();
  const parts: string[] = [];
  while (pending.length) {
    const item = pending.pop()!;
    if (typeof item === 'string') { parts.push(item); continue; }
    if (item.type === 'text') { parts.push(item.data); continue; }
    if (!('children' in item)) continue;
    const name = 'name' in item ? item.name.toLowerCase() : '';
    if (name === 'br' || name === 'hr') { parts.push('\n'); continue; }
    const block = BLOCKS.has(name);
    if (block) { parts.push('\n'); pending.push('\n'); }
    if (name === 'td' || name === 'th') parts.push(' ');
    for (let index = item.children.length - 1; index >= 0; index--) pending.push(item.children[index]);
  }
  return tidy(parts.join(''));
}

/** A preliminary syntactic filter only. The fetcher separately validates and pins DNS on every hop. */
function webUrl(raw: unknown, base?: string): string | undefined {
  if (typeof raw !== 'string' || raw.length > MAX_URL || !raw.trim() || /[\u0000-\u0020\u007F]/.test(raw.trim())) return;
  try {
    const url = base ? new URL(raw.trim(), base) : new URL(raw.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (!host || host === 'localhost' || /\.(?:localhost|local|internal|lan|home|home\.arpa)$/.test(host)) return;
    if (ipaddr.isValid(host)) {
      if (ipaddr.process(host).range() !== 'unicast') return;
    } else if (!host.includes('.')) return;
    url.hash = '';
    return url.href;
  } catch { return; }
}

function charsetOf(contentType: string): string | undefined {
  return /(?:^|;)\s*charset\s*=\s*["']?([A-Za-z0-9._-]{1,64})/i.exec(contentType)?.[1];
}

function document(body: Buffer, contentType = 'text/html'): CheerioAPI {
  return loadBuffer(body, { encoding: { defaultEncoding: 'utf-8', transportLayerEncodingLabel: charsetOf(contentType) } });
}

function removeNoise($: CheerioAPI): void {
  $(OMIT).remove();
  $('[style]').each((_index, element) => {
    const style = $(element).attr('style') ?? '';
    if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))(?:\s*!important)?\s*(?:;|$)/i.test(style)) $(element).remove();
  });
}

function rejectBlockingPage($: CheerioAPI): void {
  // Specific challenge UI markers, rather than keywords that could occur in an ordinary article.
  if ($('#anomaly-form,#challenge-form,.anomaly-modal,#cf-challenge-running,.cf-browser-verification').length) throw new SurfError('access_blocked');
  const heading = tidy($('title').first().text() || $('h1').first().text());
  if (/^(?:just a moment(?:\.{0,3})?|checking your browser(?:\.{0,3})?|verify (?:you are|that you are) human|security verification|安全验证|访问验证|人机验证)$/i.test(heading)
      && $('#challenge-stage,.g-recaptcha,.h-captcha,[data-sitekey],script[src*="challenge-platform"]').length) throw new SurfError('access_blocked');
  if (/^(?:sign[ -]?in|log[ -]?in|login|登录|登入|请先登录)(?:\s*[|—–-].*)?$/i.test(heading)
      && $('input[type="password"]').length) throw new SurfError('access_blocked');
}

function chooseContent($: CheerioAPI): AnyNode {
  for (const selector of ['article', 'main', '[role="main"]']) {
    let selected: AnyNode | undefined;
    let longest = -1;
    for (const candidate of $(selector).toArray().slice(0, 128)) {
      const length = textOf([candidate]).length;
      if (length > longest && (length > 0 || $(candidate).find('img').length)) { selected = candidate; longest = length; }
    }
    if (selected) return selected;
  }
  return $('body')[0] ?? $.root()[0];
}

function selectedImage($: CheerioAPI, node: AnyNode, base: string): string | undefined {
  const img = $(node);
  if (img.attr('width') === '1' && img.attr('height') === '1') return;
  for (const value of [img.attr('data-src'), img.attr('data-original'), img.attr('src')]) {
    const url = webUrl(value, base);
    if (url) return url;
  }
  const srcset = img.attr('srcset') || img.attr('data-srcset');
  if (!srcset) return;
  const candidates = srcset.split(',').map(item => {
    const [source, descriptor = '1x'] = item.trim().split(/\s+/);
    return { source, rank: /^\d+(?:\.\d+)?[wx]$/.test(descriptor) ? Number.parseFloat(descriptor) : 0 };
  }).sort((a, b) => b.rank - a.rank);
  for (const candidate of candidates) {
    const url = webUrl(candidate.source, base);
    if (url) return url;
  }
}

/** Parse without rendering, following links, fetching media, or executing scripts. */
export function parsePage(body: Buffer, url: string, contentType: string, maxTextChars: number): ParsedPage {
  if (!Buffer.isBuffer(body) || !Number.isInteger(maxTextChars) || maxTextChars < 1 || maxTextChars > 2_000_000) throw new SurfError('invalid_input');
  const pageUrl = webUrl(url);
  if (!pageUrl) throw new SurfError('unsafe_url');
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime === 'text/plain') {
    let decoder: TextDecoder;
    try { decoder = new TextDecoder(charsetOf(contentType) || 'utf-8'); } catch { decoder = new TextDecoder('utf-8'); }
    const text = tidy(decoder.decode(body));
    if (!text) throw new SurfError('unsupported_content');
    return { title: new URL(pageUrl).hostname, text: clipped(text, maxTextChars), links: [], images: [], totalTextChars: text.length, truncated: text.length > maxTextChars };
  }
  if (mime !== 'text/html' && mime !== 'application/xhtml+xml') throw new SurfError('unsupported_content');
  const $ = document(body, contentType);
  rejectBlockingPage($);
  const title = clipped(tidy($('title').first().text() || $('meta[property="og:title"]').attr('content') || $('h1').first().text()), 300);
  const base = webUrl($('base[href]').first().attr('href'), pageUrl) ?? pageUrl;
  const hadScripts = $('script').length > 0;
  removeNoise($);
  const content = chooseContent($);
  const links: WebLink[] = [];
  const images: WebImage[] = [];
  const seenLinks = new Set<string>();
  const seenImages = new Set<string>();
  $(content).find('a[href]').each((_index, element) => {
    if (links.length >= 40) return;
    const raw = $(element).attr('href');
    if (raw?.trim().startsWith('#')) return;
    const target = webUrl(raw, base);
    if (!target || seenLinks.has(target)) return;
    seenLinks.add(target);
    links.push({ url: target, text: clipped(textOf([element]) || tidy($(element).attr('title') ?? '') || new URL(target).hostname, 300) });
  });
  $(content).find('img').each((_index, element) => {
    if (images.length >= 32) return;
    const target = selectedImage($, element, base);
    if (!target || seenImages.has(target)) return;
    seenImages.add(target);
    images.push({ url: target, alt: clipped(tidy($(element).attr('alt') ?? ''), 300) });
  });
  const text = textOf([content]);
  const scriptShell = hadScripts && images.length === 0 && links.length === 0
    && (/^(?:(?:please\s+)?(?:enable|turn on) javascript(?:\s+to (?:continue|view|use|run)[\s\S]*)?|you need to enable javascript[\s\S]*|请(?:开启|启用)\s*javascript[\s\S]*)[.!。]?$/i.test(text)
      || /^(?:loading|正在加载|加载中)(?:\.{0,3}|…{0,2})$/i.test(text));
  if ((!text && !images.length) || scriptShell) {
    throw new SurfError('unsupported_content');
  }
  return {
    title: title || new URL(pageUrl).hostname, text: clipped(text, maxTextChars), links, images,
    totalTextChars: text.length, truncated: text.length > maxTextChars,
    notice: !text ? '本页没有可提取正文；图片可按需交给视觉插件。' : undefined,
  };
}

function searchLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new SurfError('invalid_input');
  return limit;
}

function ddgTarget(raw: string | undefined, base: string): string | undefined {
  if (!raw) return;
  try {
    const target = new URL(raw, base);
    if ((target.hostname === 'duckduckgo.com' || target.hostname.endsWith('.duckduckgo.com')) && /^\/l\/?$/.test(target.pathname)) {
      return webUrl(target.searchParams.get('uddg'));
    }
    return webUrl(raw, base);
  } catch { return; }
}

/** HTML and Lite search pages are adapters, not an undocumented JSON API. */
export function parseDuckDuckGo(body: Buffer, url: string, limit: number): SearchItem[] {
  searchLimit(limit);
  const base = webUrl(url);
  if (!base) throw new SurfError('unsafe_url');
  const $ = document(body);
  rejectBlockingPage($);
  removeNoise($);
  const results: SearchItem[] = [];
  const seen = new Set<string>();
  const anchors = $('a.result__a,a.result-link');
  anchors.each((_index, element) => {
    if (results.length >= limit || $(element).closest('.result--ad,.result--sponsored,[data-layout="ad"]').length) return;
    const target = ddgTarget($(element).attr('href'), base);
    const title = clipped(textOf([element]), 300);
    if (!target || !title || seen.has(target)) return;
    let snippet = $(element).closest('.result').find('.result__snippet').first().text();
    if (!snippet && $(element).hasClass('result-link')) {
      for (const row of $(element).closest('tr').nextAll('tr').toArray().slice(0, 4)) {
        if ($(row).find('a.result-link').length) break;
        const text = $(row).find('.result-snippet').first().text();
        if (text) { snippet = text; break; }
      }
    }
    seen.add(target);
    results.push({ title, url: target, snippet: clipped(tidy(snippet), 1200) });
  });
  if (results.length) return results;
  // Do not interpret challenges, layout changes, or invalid result links as an empty search.
  if (anchors.length) throw new SurfError('search_parse');
  if ($('.no-results,.no-results__message,.result--no-result').length) return [];
  const plain = textOf([$('body')[0] ?? $.root()[0]]);
  if (/duckduckgo/i.test($('title').text()) && /\bno (?:more )?results (?:found|were found)\b/i.test(plain)) return [];
  throw new SurfError('search_parse');
}

function inlineText(value: string): string {
  const $ = load(value);
  removeNoise($);
  return textOf([$('body')[0] ?? $.root()[0]]);
}

/** Parse only the published web.results subset; unexpected responses remain failures. */
export function parseBrave(body: Buffer, limit: number): SearchItem[] {
  searchLimit(limit);
  let payload: unknown;
  try { payload = JSON.parse(body.toString('utf8')); } catch { throw new SurfError('search_parse'); }
  if (!payload || typeof payload !== 'object' || !('web' in payload) || !payload.web || typeof payload.web !== 'object'
      || !('results' in payload.web) || !Array.isArray(payload.web.results)) throw new SurfError('search_parse');
  const results: SearchItem[] = [];
  const seen = new Set<string>();
  for (const value of payload.web.results) {
    if (!value || typeof value !== 'object' || typeof value.title !== 'string' || typeof value.url !== 'string'
        || (value.description !== undefined && typeof value.description !== 'string')) continue;
    const url = webUrl(value.url);
    const title = clipped(inlineText(value.title), 300);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet: clipped(inlineText(value.description ?? ''), 1200) });
    if (results.length >= limit) break;
  }
  if (!results.length && payload.web.results.length) throw new SurfError('search_parse');
  return results;
}

/** AnySearch /v1/search JSON adapter. Unknown envelope shapes stay failures, not empty results. */
export function parseAnySearch(body: Buffer, limit: number): SearchItem[] {
  searchLimit(limit);
  let payload: unknown;
  try { payload = JSON.parse(body.toString('utf8')); } catch { throw new SurfError('search_parse'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new SurfError('search_parse');
  const envelope = payload as Record<string, unknown>;
  if (envelope.code !== undefined && envelope.code !== null && envelope.code !== 0) {
    const message = typeof envelope.message === 'string' ? envelope.message : String(envelope.code);
    // 鉴权、额度、区域不支持这类问题应当让上层回退到下一个来源，而不是当作解析失败。
    throw new SurfError(/auth|key|token|quota|rate|limit|额度|鉴权|授权|权限|区域|zone/i.test(message) ? 'search_unconfigured' : 'access_blocked');
  }
  const data = envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
    ? envelope.data as Record<string, unknown> : envelope;
  if (!Array.isArray(data.results)) throw new SurfError('search_parse');
  const results: SearchItem[] = [];
  const seen = new Set<string>();
  for (const value of data.results) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    if (typeof item.url !== 'string') continue;
    const url = webUrl(item.url);
    const title = clipped(inlineText(typeof item.title === 'string' ? item.title : ''), 300);
    if (!url || !title || seen.has(url)) continue;
    const rawSnippet = typeof item.snippet === 'string' ? item.snippet
      : typeof item.content === 'string' ? item.content : '';
    seen.add(url);
    results.push({ title, url, snippet: clipped(inlineText(rawSnippet), 1200) });
    if (results.length >= limit) break;
  }
  if (!results.length && data.results.length) throw new SurfError('search_parse');
  return results;
}
