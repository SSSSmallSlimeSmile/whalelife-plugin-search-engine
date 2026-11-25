/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import { load } from 'cheerio';
import { SurfError } from './errors.ts';
import type { ParsedPage, PublicFetcher } from './types.ts';

/** 结构化读取：命中这几类页面就改打公开 API，拿干净字段，不解析页面壳。
 *  GitHub 的 issue / PR / release、Stack Exchange 问答、arXiv 摘要、维基百科正文，
 *  都有免 Key 的公开接口；用它们比抓 HTML 干净得多，也不用跟对方的导航栏和登录墙较劲。 */
export type StructuredKind = 'github-issue' | 'github-pr' | 'github-release' | 'stackexchange' | 'arxiv' | 'wikipedia';

export interface StructuredTarget {
  kind: StructuredKind;
  /** 写进回执的名字。 */
  label: string;
  owner?: string; repo?: string; number?: number; tag?: string;
  site?: string; questionId?: number;
  lang?: string; title?: string; arxivId?: string;
}

export interface StructuredOptions {
  timeoutMs: number;
  maxBytes: number;
  maxTextChars: number;
  proxyUrl?: string;
  signal?: AbortSignal;
}

const SE_HOSTS: Record<string, string> = {
  'stackoverflow.com': 'stackoverflow',
  'superuser.com': 'superuser',
  'serverfault.com': 'serverfault',
  'askubuntu.com': 'askubuntu',
  'mathoverflow.net': 'mathoverflow',
};

function clipped(value: string, maximum: number): string {
  let text = value.slice(0, maximum);
  if (text.length && /[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return text;
}

function tidy(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\t \u00A0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function rec(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nmb(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 只认路径形状，不认查询串：一个 URL 该走哪条 API 是固定的。 */
export function detectStructured(raw: string): StructuredTarget | undefined {
  let url: URL;
  try { url = new URL(raw); } catch { return; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'github.com' || host === 'www.github.com') {
    if (parts.length < 3) return;
    const owner = parts[0], repo = parts[1], section = parts[2];
    if (section === 'issues' && /^\d{1,10}$/.test(parts[3] ?? ''))
      return { kind: 'github-issue', label: 'GitHub issue', owner, repo, number: Number(parts[3]) };
    if (section === 'pull' && /^\d{1,10}$/.test(parts[3] ?? ''))
      return { kind: 'github-pr', label: 'GitHub pull request', owner, repo, number: Number(parts[3]) };
    if (section === 'releases' && parts[3] === 'tag') {
      const rawTag = url.pathname.slice(url.pathname.indexOf('/releases/tag/') + '/releases/tag/'.length).replace(/\/+$/, '');
      let tag = rawTag;
      try { tag = decodeURIComponent(rawTag); } catch { /* 保留原样，交给编码那一层 */ }
      if (tag) return { kind: 'github-release', label: 'GitHub release', owner, repo, tag };
    }
    return;
  }

  const wiki = /^([a-z][a-z0-9-]{0,15})\.wikipedia\.org$/.exec(host);
  if (wiki && parts[0] === 'wiki' && parts.length >= 2) {
    let title = '';
    try { title = decodeURIComponent(parts.slice(1).join('/')); } catch { return; }
    if (title) return { kind: 'wikipedia', label: `维基百科（${wiki[1]}）`, lang: wiki[1], title };
    return;
  }

  if (host === 'arxiv.org' && (parts[0] === 'abs' || parts[0] === 'pdf') && parts[1]) {
    const id = parts[1].replace(/\.pdf$/i, '');
    if (/^[A-Za-z0-9.-]{2,20}(?:\/[A-Za-z0-9.-]{1,10})?$/.test(id)) return { kind: 'arxiv', label: 'arXiv', arxivId: id };
    return;
  }

  const site = SE_HOSTS[host] ?? (host.endsWith('.stackexchange.com') ? host.slice(0, -'.stackexchange.com'.length) : undefined);
  if (site && parts[0] === 'questions' && /^\d{1,10}$/.test(parts[1] ?? ''))
    return { kind: 'stackexchange', label: `Stack Exchange（${site}）`, site, questionId: Number(parts[1]) };
  return;
}

async function fetchJson(fetcher: PublicFetcher, url: string, options: StructuredOptions, headers: Record<string, string>): Promise<unknown> {
  const response = await fetcher.get(url, {
    signal: options.signal, timeoutMs: options.timeoutMs, maxBytes: options.maxBytes,
    proxyUrl: options.proxyUrl, headers: { Accept: 'application/json', ...headers },
  });
  if (response.status < 200 || response.status > 299) {
    throw new SurfError([401, 403, 429].includes(response.status) ? 'access_blocked' : 'http_error');
  }
  try { return JSON.parse(response.body.toString('utf8')); } catch { throw new SurfError('unsupported_content'); }
}

/** 富文本转纯文本。代码块单独围起来，免得被压成一行看不出缩进。 */
function htmlToText(html: string): string {
  const $ = load(`<div id="__structured_root">${html}</div>`);
  const root = $('#__structured_root');
  root.find('script,style,noscript').remove();
  root.find('pre').each((_index, element) => {
    const code = $(element).text().replace(/\n+$/, '');
    // 用文本节点回填：代码块里常有 <vector> 这种裸尖括号，塞回 HTML 会被当成标签吃掉。
    $(element).replaceWith($('<pre>').text('\n```\n' + code + '\n```\n'));
  });
  root.find('br').replaceWith('\n');
  root.find('p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,dt,dd').each((_index, element) => { $(element).append('\n'); });
  return tidy(root.text());
}

function pageOf(title: string, text: string, links: ParsedPage['links'], notice: string, maxTextChars: number): ParsedPage {
  const bounded = clipped(text, maxTextChars);
  return {
    title: clipped(tidy(title), 300) || '（没有标题）', text: bounded, links, images: [],
    totalTextChars: text.length, truncated: text.length > maxTextChars, notice,
  };
}

async function github(fetcher: PublicFetcher, target: StructuredTarget, url: string, options: StructuredOptions): Promise<ParsedPage> {
  const owner = target.owner ?? '', repo = target.repo ?? '';
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const headers = { Accept: 'application/vnd.github+json' };

  if (target.kind === 'github-release') {
    const release = rec(await fetchJson(fetcher, `${base}/releases/tags/${encodeURIComponent(target.tag ?? '')}`, options, headers));
    if (!release) throw new SurfError('unsupported_content');
    const lines = [
      `${str(release.name) || str(release.tag_name)}`,
      '',
      `标签：${str(release.tag_name)}｜发布：${str(release.published_at) || '未知'}｜预发布：${release.prerelease === true ? '是' : '否'}`,
      `作者：${str(rec(release.author)?.login) || '未知'}｜链接：${str(release.html_url)}`,
      '',
      str(release.body) || '（这个 release 没有正文）',
    ];
    return pageOf(str(release.name) || str(release.tag_name) || `${owner}/${repo}`,
      tidy(lines.join('\n')), [{ text: 'release 页面', url: str(release.html_url) || url }],
      `已按 ${target.label} 走公开 API 取结构化字段，不是页面快照。`, options.maxTextChars);
  }

  const number = target.number ?? 0;
  const issue = rec(await fetchJson(fetcher, `${base}/issues/${number}`, options, headers));
  if (!issue) throw new SurfError('unsupported_content');
  const isPull = target.kind === 'github-pr' || issue.pull_request !== undefined;
  const labels = list(issue.labels).map(item => str(rec(item)?.name)).filter(Boolean).join('、');
  const lines = [
    str(issue.title),
    '',
    `状态：${str(issue.state) || '未知'}｜作者：${str(rec(issue.user)?.login) || '未知'}｜创建：${str(issue.created_at) || '未知'}｜更新：${str(issue.updated_at) || '未知'}`,
    ...(labels ? [`标签：${labels}`] : []),
    `链接：${str(issue.html_url) || url}`,
    '',
    str(issue.body) || '（没有正文）',
  ];

  let commentNote = '';
  try {
    const raw = await fetchJson(fetcher, `${base}/issues/${number}/comments?per_page=30`, {
      ...options, timeoutMs: Math.min(options.timeoutMs, 8000),
    }, headers);
    const comments = list(raw).map(rec).filter((item): item is Record<string, unknown> => item !== undefined);
    if (comments.length) {
      const total = nmb(rec(issue)?.comments) || comments.length;
      lines.push('', '---', '', `评论（共 ${total} 条，按时间取前 ${comments.length} 条）：`, '');
      for (const comment of comments) {
        lines.push(`@${str(rec(comment.user)?.login) || '未知'}（${str(comment.created_at)}）：`);
        lines.push(str(comment.body) || '（空）', '');
      }
      if (total > comments.length) lines.push(`（还有 ${total - comments.length} 条评论没取，要看得自己翻原页面。）`);
    }
  } catch (error) {
    commentNote = `评论没取到：${error instanceof SurfError ? error.code : '未知原因'}。`;
  }

  const notice = `已按 ${isPull ? 'GitHub pull request' : 'GitHub issue'} 走公开 API 取结构化字段，不是页面快照；正文是 Markdown 原文。${commentNote ? ' ' + commentNote : ''}`;
  return pageOf(str(issue.title) || `${owner}/${repo} #${number}`, tidy(lines.join('\n')),
    [{ text: '原页面', url: str(issue.html_url) || url }], notice, options.maxTextChars);
}

async function stackexchange(fetcher: PublicFetcher, target: StructuredTarget, url: string, options: StructuredOptions): Promise<ParsedPage> {
  const site = target.site ?? 'stackoverflow';
  const id = target.questionId ?? 0;
  const api = `https://api.stackexchange.com/2.3/questions/${id}?site=${encodeURIComponent(site)}&filter=withbody`;
  const questionRaw = await fetchJson(fetcher, api, options, {});
  const question = rec(list(rec(questionRaw)?.items)[0]);
  if (!question) throw new SurfError('unsupported_content');

  const lines = [
    str(question.title),
    '',
    `票数：${nmb(question.score)}｜回答：${nmb(question.answer_count)}｜浏览：${nmb(question.view_count)}｜`
      + `提问：${str(rec(question.owner)?.display_name) || '未知'}｜时间：${str(new Date(nmb(question.creation_date) * 1000).toISOString().slice(0, 10))}`,
    `链接：${str(question.link) || url}`,
    '',
    htmlToText(str(question.body)) || '（这一次来源没返回问题正文：它的部分问题详情会被换成不带正文的版本，答案通常还在。）',
  ];

  const accepted = nmb(question.accepted_answer_id);
  if (accepted) lines.push('', '（此问题有已采纳答案）');

  let answerNote = '';
  try {
    const answerApi = `https://api.stackexchange.com/2.3/questions/${id}/answers?site=${encodeURIComponent(site)}`
      + '&filter=withbody&sort=votes&order=desc&pagesize=5';
    const answerRaw = await fetchJson(fetcher, answerApi, { ...options, timeoutMs: Math.min(options.timeoutMs, 8000) }, {});
    const answers = list(rec(answerRaw)?.items).map(rec)
      .filter((item): item is Record<string, unknown> => item !== undefined);
    if (answers.length) {
      lines.push('', '---', '', `回答（按票数取前 ${answers.length} 条）：`, '');
      for (const answer of answers) {
        const mark = answer.is_accepted === true ? '【已采纳】' : '';
        lines.push(`@${str(rec(answer.owner)?.display_name) || '匿名'}（${nmb(answer.score)} 票）${mark}：`);
        lines.push(htmlToText(str(answer.body)) || '（空）', '');
      }
      const total = nmb(question.answer_count);
      if (total > answers.length) lines.push(`（共 ${total} 条回答，这里取票数最高的 ${answers.length} 条。）`);
    }
  } catch (error) {
    answerNote = `回答没取到：${error instanceof SurfError ? error.code : '未知原因'}。`;
  }

  const notice = `已按 ${target.label} 走公开 API 取结构化字段，回答按票数排序、已采纳的排在前面。${answerNote ? ' ' + answerNote : ''}`;
  return pageOf(str(question.title), tidy(lines.join('\n')),
    [{ text: '原页面', url: str(question.link) || url }], notice, options.maxTextChars);
}

async function arxiv(fetcher: PublicFetcher, target: StructuredTarget, url: string, options: StructuredOptions): Promise<ParsedPage> {
  const api = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(target.arxivId ?? '')}`;
  const response = await fetcher.get(api, {
    signal: options.signal, timeoutMs: options.timeoutMs, maxBytes: options.maxBytes,
    proxyUrl: options.proxyUrl, headers: { Accept: 'application/atom+xml,application/xml' },
  });
  if (response.status < 200 || response.status > 299) throw new SurfError('http_error');
  const $ = load(response.body.toString('utf8'), { xmlMode: true });
  const entry = $('entry').first();
  if (!entry.length) throw new SurfError('unsupported_content');
  const title = tidy(entry.find('title').first().text());
  const summary = tidy(entry.find('summary').first().text());
  const authors = entry.find('author').map((_index, element) => tidy($(element).find('name').first().text()))
    .get().filter(Boolean).join('、');
  const published = tidy(entry.find('published').first().text()).slice(0, 10);
  const comment = tidy(entry.find('arxiv\\:comment').first().text() || entry.find('comment').first().text());
  const abs = `https://arxiv.org/abs/${target.arxivId}`;
  const lines = [
    title,
    '',
    `作者：${authors || '未知'}｜提交：${published || '未知'}｜arXiv：${target.arxivId}`,
    ...(comment ? [`备注：${comment}`] : []),
    `链接：${abs}`,
    '',
    summary || '（没有摘要）',
  ];
  return pageOf(title, tidy(lines.join('\n')), [{ text: 'arXiv 摘要页', url: abs }],
    `已按 ${target.label} 走官方 Atom 接口取元数据与摘要，不是页面快照；全文 PDF 不在这里。`, options.maxTextChars);
}

async function wikipedia(fetcher: PublicFetcher, target: StructuredTarget, url: string, options: StructuredOptions): Promise<ParsedPage> {
  const lang = target.lang ?? 'zh';
  const api = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1`
    + `&titles=${encodeURIComponent(target.title ?? '')}`;
  const data = rec(await fetchJson(fetcher, api, options, {}));
  const pages = rec(rec(data?.query)?.pages) ?? {};
  const first = Object.values(pages).map(rec).find((item): item is Record<string, unknown> => item !== undefined);
  if (!first || first.missing !== undefined) throw new SurfError('unsupported_content');
  const text = str(first.extract);
  if (!text) throw new SurfError('unsupported_content');
  const title = str(first.title) || target.title || '';
  const pageUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  return pageOf(title, tidy(`${title}\n\n${text}`), [{ text: '条目页面', url: pageUrl }],
    `已按 ${target.label} 走 MediaWiki 接口取纯文本正文，不是页面快照；脚注、表格与图片说明不在其中。`, options.maxTextChars);
}

/** 命中结构化类型就返回解析好的页面；不命中返回 undefined。全部失败都抛 SurfError，由调用方决定回落。 */
export async function fetchStructured(fetcher: PublicFetcher, target: StructuredTarget, url: string, options: StructuredOptions): Promise<ParsedPage> {
  switch (target.kind) {
    case 'github-issue': case 'github-pr': case 'github-release':
      return github(fetcher, target, url, options);
    case 'stackexchange':
      return stackexchange(fetcher, target, url, options);
    case 'arxiv':
      return arxiv(fetcher, target, url, options);
    case 'wikipedia':
      return wikipedia(fetcher, target, url, options);
    default:
      throw new SurfError('unsupported_content');
  }
}
