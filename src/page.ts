/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
/** 设置页：结构、配色都走 /ui/styles.css，与其它插件页面同一套皮。 */
export const settingsPage = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>搜索引擎 · 设置</title>
<link rel="stylesheet" href="/ui/styles.css">
<style>
.panel-body .pg-row{display:block;margin:0}
.panel-body .pg-label{display:block!important;font-size:15px!important;font-weight:700!important;color:inherit;margin:0 0 10px;line-height:1.45}
.panel-body .pg-row input[type=text],.panel-body .pg-row input[type=number],.panel-body .pg-row input[type=password],.panel-body .pg-row select{display:block;width:100%;box-sizing:border-box;padding:10px 13px;font-size:14px;line-height:1.4;border-radius:8px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font-family:inherit}
.panel-body .pg-row input:focus,.panel-body .pg-row select:focus{outline:none;border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.12)}
.panel-body .pg-check{display:flex!important;align-items:center;gap:10px;padding-top:2px}
.panel-body .pg-check .pg-label{margin:0}
.panel-body .pg-pair{display:grid;grid-template-columns:1fr 1fr;column-gap:36px;margin:0 0 30px}
.panel-body .pg-pair:last-child{margin-bottom:0}
.panel-body .pg-pair>.pg-item:only-child{grid-column:1/-1}
.panel-body .pg-item{min-width:0}
.panel-body .pg-hint{margin:10px 0 0;font-size:12px;line-height:1.65;color:#797e8c}
.panel-body .pg-ro{display:grid;grid-template-columns:150px 1fr;gap:16px;margin:14px 0;font-size:13px;align-items:baseline}
.panel-body .pg-ro b{font-weight:600;color:#797e8c}
.panel-body .pg-ro code{background:rgba(127,127,127,.12);padding:2px 6px;border-radius:5px;word-break:break-all;font-size:12px}
.pg-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:0;margin:0;border-bottom:0}
.pg-tab{background:transparent;border:1px solid transparent;border-radius:8px;padding:7px 13px;font-size:14px;color:#797e8c;cursor:pointer;font-family:inherit;line-height:1.2}
.pg-tab:hover{background:rgba(124,92,255,.08);color:#6d4aff}
.pg-tab.on{background:rgba(124,92,255,.12);border-color:rgba(124,92,255,.35);color:#6d4aff;font-weight:600}
.pg-desc{margin:0 0 22px;padding:0 0 14px;font-size:13px;line-height:1.75;color:#797e8c;border-bottom:1px dashed rgba(127,127,127,.22)}
.pg-actions{display:flex;align-items:center;gap:12px;margin-left:auto}
#msg{font-size:13px;color:#797e8c}
#msg.err{color:#b91c1c}
.chain{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.chain-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid rgba(127,127,127,.28);border-radius:8px;background:rgba(127,127,127,.04);font-size:14px;cursor:grab}
.chain-row.drag{opacity:.45}
.chain-row.over{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.12)}
.chain-row .grip{color:#9aa0b0;letter-spacing:-1px;user-select:none}
.chain-row b{font-weight:600;min-width:110px}
.chain-row em{font-style:normal;font-size:12px;color:#9aa0b0}
.chain-btns{margin-left:auto;display:flex;align-items:center;gap:6px}
.chain-btns button{background:transparent;border:1px solid rgba(127,127,127,.3);color:inherit;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;font-family:inherit}
.chain-btns button:hover{border-color:#7c5cff;color:#6d4aff}
.chain-btns button:disabled{opacity:.4;cursor:default}
.chain-add{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.presets{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.preset-group{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:8px}
.preset-title{grid-column:1/-1;font-size:12px;color:#797e8c;margin-top:2px}
.preset{display:flex;flex-direction:column;gap:3px;text-align:left;max-width:none;padding:9px 11px;border:1px solid rgba(127,127,127,.3);border-radius:9px;background:transparent;color:inherit;cursor:pointer;font-family:inherit}
.preset{position:relative}
.preset:hover{border-color:#7c5cff}
.preset .more{position:absolute;top:5px;right:5px;width:20px;height:18px;line-height:16px;text-align:center;border:1px solid rgba(127,127,127,.28);border-radius:5px;background:rgba(127,127,127,.06);color:#797e8c;font-size:12px;font-weight:700;font-style:normal;opacity:0;transition:opacity .12s;cursor:pointer;user-select:none}
.preset:hover .more,.preset .more:focus,.preset.on .more,.preset.blocked .more{opacity:1}
.keypop{position:fixed;z-index:9999;width:284px;padding:12px 12px 10px;border:1px solid rgba(127,127,127,.34);border-radius:10px;background:#fff;box-shadow:0 12px 32px rgba(0,0,0,.18);font-size:13px;color:#22252d;text-align:left}
.keypop[hidden]{display:none}
.keypop .kp-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px;cursor:move;user-select:none}
.keypop .kp-head span{cursor:default}
.keypop .kp-desc{font-size:11px;color:#797e8c;line-height:1.5;margin:0}
.keypop #kpKeyWrap{display:flex;flex-direction:column;gap:7px}
.keypop [hidden]{display:none}
.keypop .kp-head b{font-size:13px}
.keypop .kp-head span{font-size:11px;color:#797e8c}
.keypop input{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid rgba(127,127,127,.34);border-radius:7px;font-size:13px;font-family:inherit}
.keypop .kp-actions{display:flex;gap:6px;margin-top:9px}
.keypop .kp-actions button{padding:4px 10px;font-size:12px;border:1px solid rgba(127,127,127,.34);border-radius:7px;background:transparent;color:inherit;cursor:pointer;font-family:inherit}
.keypop .kp-actions button.primary{background:#7c5cff;border-color:#7c5cff;color:#fff}
.keypop .kp-msg{margin-top:7px;font-size:11px;color:#797e8c;min-height:1em}
.keypop .kp-msg.err{color:#b91c1c}
.keypop .kp-body{display:flex;flex-direction:column;gap:7px}
.keypop .kp-check{display:flex;align-items:center;gap:6px;font-size:11px;color:#797e8c}
.pg-tools{display:flex;align-items:center;gap:8px;margin:8px 0 2px}
.pg-tools .btn{padding:3px 9px;font-size:12px}
#customForm{position:fixed;z-index:9998;left:0;top:0;width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 32px);overflow:auto;padding:14px 14px 10px;border:1px solid rgba(127,127,127,.34);border-radius:12px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.2)}
#customForm[hidden]{display:none}
#customForm .cf-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:8px;cursor:move;user-select:none}
.preset b{font-size:13px}
.preset span{font-size:12px;color:#797e8c;line-height:1.45}
.preset em{font-size:11px;color:#6d4aff;font-style:normal}
.preset.on{opacity:.55;cursor:default;border-style:dashed}
.preset.on em{color:#15803d}
.preset.blocked{opacity:.55;cursor:not-allowed}
.preset.blocked em{color:#b45309}
.preset.blocked{cursor:pointer}
.pg-item.flash{animation:pgflash 1.2s ease-out}
.preset .del{align-self:flex-start;margin-top:2px;padding:2px 7px;font-size:11px;border:1px solid rgba(127,127,127,.35);border-radius:6px;background:transparent;color:#b91c1c;cursor:pointer;font-family:inherit}
.preset .del:hover{border-color:#b91c1c}
@keyframes pgflash{0%{background:rgba(124,92,255,.16)}100%{background:transparent}}
.chain-sel{width:auto!important;min-width:130px;padding:7px 10px!important;font-size:13px!important;display:inline-block!important}
.chain-msg{font-size:12px;color:#797e8c}
.chain-msg.ok{color:#15803d}
.chain-msg.err{color:#b91c1c}
@media(max-width:720px){.panel-body .pg-pair{grid-template-columns:1fr}}
</style></head><body>
<section class="panel"><div class="panel-header"><div class="pg-tabs">
<button type="button" class="pg-tab on" data-goto="source">来源</button>
<button type="button" class="pg-tab" data-goto="search">搜索</button>
<button type="button" class="pg-tab" data-goto="read">读取</button>
<button type="button" class="pg-tab" data-goto="scholar">学术</button>
</div><div class="pg-actions"><button class="btn" type="button" id="refresh">重新读取</button><button class="btn primary" type="submit" form="f" id="save" disabled>保存</button><span id="msg"></span></div></div>
<div class="panel-body"><form id="f">

<section class="pg-group" id="pg-source">
<p class="pg-desc">按顺序尝试搜索来源：前一个失败才换下一个。第一个来源拿剩余预算的七成，其余按数量均分——最可能成的那个不至于被掐得太早。</p>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">搜索来源（有序，可拖动排序）</span>
<ul id="chain" class="chain"></ul>
<div id="chainMsg" class="chain-msg" style="margin-top:10px;min-height:1em"></div>
<div class="pg-tools"><button type="button" class="btn" id="proxyOpen">代理设置</button><span class="pg-hint" style="margin:0" id="proxyState"></span></div>
<div class="presets" id="presets">
  <div class="preset-group"><span class="preset-title">无需 Key</span>
    <div class="preset" role="button" tabindex="0" data-provider="anysearch" data-needkey="0"><b>anysearch</b><span>聚合搜索，不带 Key 走匿名额度；分 cn / intl 两区，垂直频道只有它支持</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
    <div class="preset" role="button" tabindex="0" data-provider="duckduckgo" data-needkey="0"><b>duckduckgo</b><span>解析结果页 HTML，不需要 Key；对方改版就可能失效</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
    <div class="preset" role="button" tabindex="0" data-provider="bing" data-needkey="0"><b>bing</b><span>cn.bing.com 结果页解析，国内可达性好</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
    <div class="preset" role="button" tabindex="0" data-provider="github" data-needkey="0"><b>github</b><span>官方仓库搜索接口，不需要 Key；未登录每小时 60 次，超了会明说被限流</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
    <div class="preset" role="button" tabindex="0" data-provider="huggingface" data-needkey="0"><b>huggingface</b><span>模型库搜索，返回 id、任务类型、下载量；不需要 Key</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
  </div>
  <div class="preset-group"><span class="preset-title">需要 Key</span>
    <div class="preset" role="button" tabindex="0" data-provider="brave" data-needkey="1"><b>brave</b><span>官方 JSON 接口，最稳的一档；要 Brave Search API Key</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
    <div class="preset" role="button" tabindex="0" data-provider="tavily" data-needkey="1"><b>tavily</b><span>面向 agent 的搜索 API，直接给正文片段；要 Tavily API Key</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
    <div class="preset" role="button" tabindex="0" data-provider="exa" data-needkey="1"><b>exa</b><span>语义搜索，结果带正文摘录；要 Exa API Key</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
  </div>
  <div class="preset-group"><span class="preset-title">自定义</span>
    <button type="button" class="preset" id="customNew"><b>+ 自定义来源</b><span>填一个返回 JSON 的搜索接口：地址里写 {query}，点「探一下」把字段选出来，不用背结构</span><em>点一下填接口</em></button>
    <div id="customCards" style="display:contents"></div>
  </div>
</div>
<div class="pg-item" id="customForm" hidden>
<div class="cf-head"><span class="pg-label" id="customTitle">新自定义来源</span><span class="pg-hint" style="margin:0">只收 JSON 接口</span></div>
<div class="pg-pair">
<label class="pg-row"><span class="pg-label">名字</span><input type="text" id="cName" placeholder="mysearch：小写字母数字，1–24 位" autocomplete="off"></label>
<label class="pg-row"><span class="pg-label">请求地址</span><input type="text" id="cUrl" placeholder="https://api.example.com/search?q={query}" autocomplete="off"></label>
</div>
<div class="pg-pair">
<label class="pg-row"><span class="pg-label">方法</span><select id="cMethod"><option value="GET">GET</option><option value="POST">POST</option></select></label>
<label class="pg-row"><span class="pg-label">Key（可选）</span><input type="password" id="cKey" placeholder="放在 Authorization: Bearer；留空就不带" autocomplete="new-password"></label>
</div>
<div class="pg-pair">
<label class="pg-row"><span class="pg-label">结果数组</span><input type="text" id="cItems" placeholder="data.results；根就是数组填 $"></label>
<label class="pg-row"><span class="pg-label">标题字段</span><input type="text" id="cTitle" placeholder="title"></label>
</div>
<div class="pg-pair">
<label class="pg-row"><span class="pg-label">链接字段</span><input type="text" id="cLink" placeholder="url"></label>
<label class="pg-row"><span class="pg-label">摘要字段（可空）</span><input type="text" id="cSnippet" placeholder="content"></label>
</div>
<div class="chain-add"><button class="btn" type="button" id="cProbe">探一下</button><button class="btn primary" type="button" id="cSave">加到列表</button><button class="btn" type="button" id="cCancel">取消</button><span class="chain-msg" id="cMsg"></span></div>
<p class="pg-hint">只收 http/https、不跟随跳转——查询串不会被重发到另一个域。字段只认点路径（a.b.c），不支持数组下标。地址里没有 {query} 会被拒。POST 会发 {query, limit} 的 JSON 体。Key 存盘后不回传页面，同名留空表示沿用原值。</p>
</div>
<input type="hidden" name="searchProviders" id="searchProviders">
<div id="hiddenFields" hidden>
<div class="pg-item"><label class="pg-row"><span class="pg-label">借道代理</span><input type="password" name="proxyUrl" id="proxyUrl" autocomplete="new-password"></label>
<span class="pg-check"><input id="clearProxy" type="checkbox" name="clearProxy"></span></div>
<div class="pg-item"><input type="password" name="braveApiKey" id="braveApiKey" autocomplete="new-password"><p class="pg-hint" id="keyState"></p><input id="clearBraveApiKey" type="checkbox" name="clearBraveApiKey"></div>
<div class="pg-item"><input type="password" name="tavilyApiKey" id="tavilyApiKey" autocomplete="new-password"><p class="pg-hint" id="tavilyState"></p><input id="clearTavilyApiKey" type="checkbox" name="clearTavilyApiKey"></div>
<div class="pg-item"><input type="password" name="exaApiKey" id="exaApiKey" autocomplete="new-password"><p class="pg-hint" id="exaState"></p><input id="clearExaApiKey" type="checkbox" name="clearExaApiKey"></div>
<div class="pg-item"><input type="password" name="anysearchApiKey" id="anysearchApiKey" autocomplete="new-password"><p class="pg-hint" id="anyState"></p><input id="clearAnySearchApiKey" type="checkbox" name="clearAnySearchApiKey"></div>
</div>

<p class="pg-hint">拖 ≡ 或点 ↑ ↓ 调整顺序，前一个失败才换下一个；第一个来源拿剩余预算的七成。「试一下」直连该来源一次，不改配置、不写回执。brave / tavily / exa 各要自己的 Key——点卡片右上角「⋯」打开设置（可拖动），没填 Key 的卡片会灰着；anysearch、github、huggingface 不带 Key 就能用。代理在「代理设置」里。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">每次默认结果数</span><input type="number" name="resultsLimit" id="resultsLimit" min="1" max="10" required></label>
<p class="pg-hint">范围 1–10。摘要不代表已阅读原网页，要正文得用 search_read。</p></div>
<div class="pg-item"><label class="pg-row"><span class="pg-label">AnySearch 区域</span><select name="anysearchZone" id="anysearchZone"><option value="cn">cn 国内</option><option value="intl">intl 国际</option></select></label>
<p class="pg-hint">只在请求 anysearch 时作为默认 zone；单次搜索可以用 search_vertical 的 zone 参数覆盖。</p></div>
</div>
</section>

<section class="pg-group" id="pg-search" hidden>
<p class="pg-desc">整次搜索有一个总预算，单个来源分到的是它的一部分。垂直搜索参数 tag / params / zone / language 只对 anysearch 生效，其余来源会在回执里注明被忽略。</p>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">整次搜索预算（秒）</span><input type="number" name="timeoutSeconds" id="timeoutSeconds" min="1" max="60" step="any" required></label>
<p class="pg-hint">所有来源加起来的上限，不是每个来源各自这么多。</p></div>
<div class="pg-item"><label class="pg-row"><span class="pg-label">同时请求数</span><input type="number" name="concurrency" id="concurrency" min="1" max="8" required></label>
<p class="pg-hint">搜索、读页、取图共用这个额度，超出直接回 busy。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">垂直搜索参数</span>
<p class="pg-hint" style="margin-top:0">tag 走 AnySearch 的垂直频道，多数还要配 params。实测可用的两组：tag=finance.quote + params { type: 'stock' }；tag=security.vuln + params { type: 'cve', value: 'CVE-2024-3094' }。zone 是 cn / intl，language 例如 zh-CN、en。这些都按次传入，这里不设默认值；不传 zone 就用上面那个区域。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">垂直搜索试一下</span>
<div class="chain-add"><select id="tagSel" class="chain-sel"><option value="">（自定义 tag）</option><option value="finance.quote">finance.quote</option><option value="security.vuln">security.vuln</option></select><input type="text" id="tagInput" class="chain-sel" placeholder="tag"><input type="text" id="paramsInput" class="chain-sel" style="min-width:240px" placeholder="params JSON">
<input type="text" id="vQuery" class="chain-sel" placeholder="查询词，留空用 whalelife"><button type="button" class="btn" id="probeVertical">试一下</button><span class="chain-msg" id="vMsg"></span></div>
<p class="pg-hint">实测可用：finance.quote 配 {"type":"stock"}；security.vuln 配 {"type":"cve","value":"CVE-2024-3094"}。裸 tag（如 academic.search）会被来源拒绝，报错里会带回它的原话。这一栏只发一次真请求，不改任何配置。</p></div>
</div>
</section>

<section class="pg-group" id="pg-read" hidden>
<p class="pg-desc">读取网页的边界。超出上限一律明确标记截断，不给不完整的正文冒充完整。</p>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">单页下载上限（KiB）</span><input type="number" name="pageKiB" id="pageKiB" min="64" max="4096" step="any" required></label></div>
<div class="pg-item"><label class="pg-row"><span class="pg-label">单图下载上限（KiB）</span><input type="number" name="imageKiB" id="imageKiB" min="64" max="16384" step="any" required></label></div>
</div>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">单页正文上限（字符）</span><input type="number" name="maxTextChars" id="maxTextChars" min="1000" max="100000" required></label>
<p class="pg-hint">正文分段返回，回执里的 remainingChars 是还没读的字数。</p></div>
<div class="pg-item"><label class="pg-row"><span class="pg-label">页面引用有效期（秒）</span><input type="number" name="referenceTtlSeconds" id="referenceTtlSeconds" min="30" max="1800" required></label>
<p class="pg-hint">pageRef 只对创建它的会话有效，重载插件后失效。</p></div>
</div>
</section>

<section class="pg-group" id="pg-scholar" hidden>
<p class="pg-desc">学术搜索是另一个工具 search_scholar，默认不注册：关着的时候它根本不在工具表里，也不占每轮的上下文。勾上保存立刻出现，取消就消失，不用重载插件。</p>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">开关</span>
<span class="pg-check"><input id="scholarEnabled" type="checkbox" name="scholarEnabled"><span class="pg-label">启用 search_scholar 工具</span></span>
<p class="pg-hint">关着时模型看不到这个工具。打开后可以按标题、作者、关键词检索论文，返回标题、作者、年份、期刊、DOI、被引数和摘要开头。</p></div>
<div class="pg-item"><label class="pg-row"><span class="pg-label">联系邮箱（可选）</span><input type="text" name="scholarMailto" id="scholarMailto" placeholder="you@example.com" autocomplete="off"></label>
<p class="pg-hint">只发给 Crossref 和 OpenAlex，进它们的 polite pool（配额更宽）。不填也能用，只是配额低一点，不会因此拒绝。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">来源（勾选即启用，按这里列出的顺序回退）</span>
<label class="pg-check"><input type="checkbox" class="scholar-src" value="arxiv"><span class="pg-label">arXiv — 预印本，全文免费，只有 XML</span></label>
<label class="pg-check"><input type="checkbox" class="scholar-src" value="openalex"><span class="pg-label">OpenAlex — 覆盖面最广，带被引数</span></label>
<label class="pg-check"><input type="checkbox" class="scholar-src" value="crossref"><span class="pg-label">Crossref — 期刊注册库，DOI 最全</span></label>
<label class="pg-check"><input type="checkbox" class="scholar-src" value="semanticscholar"><span class="pg-label">Semantic Scholar — 无 Key 时常报 429</span></label>
<p class="pg-hint">前一个连不上才换下一个；连上但零条算应答，会记进回退链再试下一个。四个都不需要 Key。想临时换顺序或只查某一个，用工具参数 sources。</p></div>
<div class="pg-item"><span class="pg-label">试一下</span>
<div class="pg-item"><select id="scholarSrcSel"><option value="arxiv">arXiv</option><option value="openalex">OpenAlex</option><option value="crossref">Crossref</option><option value="semanticscholar">Semantic Scholar</option></select>
<input type="text" id="scholarQuery" placeholder="检索词，例如 transformer attention"></div>
<button class="btn" type="button" id="scholarProbe">试一下</button> <span class="chain-msg" id="scholarMsg"></span>
<p class="pg-hint">只直连选中的那个来源一次，不改配置、不写回执。邮箱取上面那一栏当前的值。</p></div>
</div>
</section>

</form></div></section>
<script>
const byId = (id) => document.getElementById(id);
let revision = "";
const TABS = [...document.querySelectorAll(".pg-tab")];
const GROUPS = [...document.querySelectorAll(".pg-group")];
const goto = (name) => {
  for (const tab of TABS) tab.classList.toggle("on", tab.getAttribute("data-goto") === name);
  for (const group of GROUPS) group.hidden = group.id !== "pg-" + name;
};
for (const tab of TABS) tab.addEventListener("click", () => goto(tab.getAttribute("data-goto")));

let chain = [];
let hasBraveKey = false;
let hasTavilyKey = false;
let hasExaKey = false;
function hasKeyFor(name) {
  if (name === "brave") return hasBraveKey;
  if (name === "tavily") return hasTavilyKey;
  if (name === "exa") return hasExaKey;
  return true;
}
function renderChain() {
  const list = byId("chain");
  list.textContent = "";
  chain.forEach((name, index) => {
    const row = document.createElement("li");
    row.className = "chain-row";
    row.draggable = true;
    row.dataset.index = String(index);
    const grip = document.createElement("span"); grip.className = "grip"; grip.textContent = "\u2261";
    const label = document.createElement("b"); label.textContent = name;
    const order = document.createElement("em"); order.textContent = "#" + (index + 1);
    const btns = document.createElement("span"); btns.className = "chain-btns";
    const mk = (text, act, disabled) => { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.dataset.act = act; b.dataset.index = String(index); b.disabled = Boolean(disabled); return b; };
    btns.append(mk("\u2191", "up", index === 0), mk("\u2193", "down", index === chain.length - 1), mk("\u5220\u9664", "del", chain.length <= 1), mk("\u8bd5\u4e00\u4e0b", "probe", false));
    const msg = document.createElement("span"); msg.className = "chain-msg";
    btns.append(msg);
    row.append(grip, label, order, btns);
    list.append(row);
  });
  byId("searchProviders").value = chain.join(", ");
  renderCustoms();
  renderPresets();
}
function moveChain(from, to) {
  if (to < 0 || to >= chain.length || from === to) return;
  const item = chain.splice(from, 1)[0];
  chain.splice(to, 0, item);
  renderChain();
}
byId("chain").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-act]");
  if (!button) return;
  const index = Number(button.dataset.index);
  const act = button.dataset.act;
  if (act === "up") moveChain(index, index - 1);
  else if (act === "down") moveChain(index, index + 1);
  else if (act === "del") { chain.splice(index, 1); renderChain(); }
  else if (act === "probe") probe({ provider: chain[index] }, button.parentNode.querySelector(".chain-msg"));
});
byId("chain").addEventListener("dragstart", (event) => {
  const row = event.target.closest(".chain-row");
  if (!row) return;
  event.dataTransfer.setData("text/plain", row.dataset.index);
  event.dataTransfer.effectAllowed = "move";
  row.classList.add("drag");
});
byId("chain").addEventListener("dragend", () => {
  for (const item of byId("chain").querySelectorAll(".over, .drag")) item.classList.remove("over", "drag");
});
byId("chain").addEventListener("dragover", (event) => {
  const row = event.target.closest(".chain-row");
  if (!row) return;
  event.preventDefault();
  for (const item of byId("chain").querySelectorAll(".over")) if (item !== row) item.classList.remove("over");
  row.classList.add("over");
});
byId("chain").addEventListener("drop", (event) => {
  const row = event.target.closest(".chain-row");
  if (!row) return;
  event.preventDefault();
  row.classList.remove("over");
  moveChain(Number(event.dataTransfer.getData("text/plain")), Number(row.dataset.index));
});
const MAX_SOURCES = 6;
let customs = [];
const CUSTOM_MAX = 8;
const CUSTOM_NAME = /^[a-z0-9][a-z0-9_-]{0,23}$/;
function renderCustoms() {
  const box = byId("customCards");
  box.textContent = "";
  for (const item of customs) {
    const card = document.createElement("div");
    card.className = "preset";
    card.dataset.provider = "custom:" + item.name;
    card.dataset.builtin = "0";
    card.dataset.needkey = "0";
    card.dataset.index = String(customs.indexOf(item));
    const name = document.createElement("b");
    name.textContent = item.name;
    const desc = document.createElement("span");
    desc.textContent = item.url + " · 数组 " + item.items;
    const tag = document.createElement("em");
    tag.textContent = "点一下加进来";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "删";
    const more = document.createElement("i");
    more.className = "more";
    more.title = "编辑";
    more.textContent = "\u22ef";
    card.append(name, desc, tag, del, more);
    box.append(card);
  }
  const add = byId("customNew");
  if (add) {
    if (customs.length >= CUSTOM_MAX) {
      add.classList.add("blocked");
      add.querySelector("em").textContent = "最多 " + CUSTOM_MAX + " 条自定义，先删一条";
    } else {
      add.classList.remove("blocked");
      add.querySelector("em").textContent = "点一下填接口";
    }
  }
}
function renderPresets() {
  const full = chain.length >= MAX_SOURCES;
  for (const card of document.querySelectorAll(".preset")) {
    const name = card.dataset.provider;
    const needKey = card.dataset.needkey === "1";
    const on = chain.includes(name);
    const blocked = needKey && !hasKeyFor(name);
    card.setAttribute("aria-disabled", on || full ? "true" : "false");
    card.classList.toggle("on", on);
    card.classList.toggle("blocked", !on && (blocked || full));
    const tag = card.querySelector("em");
    if (on) tag.textContent = "已在链上 #" + (chain.indexOf(name) + 1);
    else if (blocked) tag.textContent = "点一下填 Key";
    else if (full) tag.textContent = "来源链已满（最多 " + MAX_SOURCES + " 个），先删一个再加";
    else tag.textContent = "点一下加进来";
  }
}
byId("presets").addEventListener("click", (event) => {
  const card = event.target.closest(".preset");
  if (!card) return;
  const moreEl = event.target.closest(".more");
  if (moreEl) {
    event.preventDefault();
    event.stopPropagation();
    if (card.dataset.builtin === "0") openCustomEdit(Number(card.dataset.index), card);
    else openSourcePop(card.dataset.provider, card);
    return;
  }
  if (card.getAttribute("aria-disabled") === "true") return;
  const name = card.dataset.provider;
  // 「+ 自定义来源」也带 .preset 类，它没有 data-provider，只负责展开表单，别当成来源加进链
  if (!name) return;
  if (card.dataset.builtin === "0") {
    if (event.target.closest("button.del")) {
      const target = name.slice(7);
      customs = customs.filter(item => item.name !== target);
      chain = chain.filter(item => item !== name);
      renderChain();
      const msg = byId("chainMsg");
      msg.className = "chain-msg";
      msg.textContent = "已删掉自定义来源 " + target + "，记得点右上「保存」";
      return;
    }
    if (card.classList.contains("blocked") || card.classList.contains("on")) return;
    if (chain.includes(name)) return;
    if (chain.length >= MAX_SOURCES) { const m = byId("chainMsg"); m.className = "chain-msg err"; m.textContent = "最多 " + MAX_SOURCES + " 个来源，先删一个再加"; return; }
    chain.push(name);
    const ok = byId("chainMsg");
    ok.className = "chain-msg ok";
    ok.textContent = "已加入：" + name + "（第 " + chain.length + " 个）";
    renderChain();
    return;
  }
  const msg = byId("chainMsg");
  if (card.classList.contains("blocked")) {
    if (card.dataset.needkey === "1" && chain.length < MAX_SOURCES) { openKeyPop(name, card); return; }
    msg.className = "chain-msg err";
    msg.textContent = "来源链已满（最多 " + MAX_SOURCES + " 个），先删一个再加";
    return;
  }
  if (chain.includes(name)) return;
  if (chain.length >= MAX_SOURCES) { msg.className = "chain-msg err"; msg.textContent = "最多 " + MAX_SOURCES + " 个来源，先删一个再加"; return; }
  chain.push(name);
  msg.className = "chain-msg ok";
  msg.textContent = "已加入：" + name + "（第 " + chain.length + " 个）";
  renderChain();
});
const KEY_FIELD = { brave: "braveApiKey", tavily: "tavilyApiKey", exa: "exaApiKey", anysearch: "anysearchApiKey" };
const CLEAR_FIELD = { brave: "clearBraveApiKey", tavily: "clearTavilyApiKey", exa: "clearExaApiKey", anysearch: "clearAnySearchApiKey" };
let kpKind = "";
let kpName = "";
const kp = document.createElement("div");
kp.className = "keypop";
kp.hidden = true;
kp.innerHTML = '<div class="kp-head"><b id="kpTitle"></b><span id="kpState"></span></div>'
  + '<p class="kp-desc" id="kpDesc"></p>'
  + '<div class="kp-body"><div id="kpKeyWrap"><input id="kpInput" type="password" autocomplete="off" spellcheck="false">'
  + '<label class="kp-check"><input id="kpClearChk" type="checkbox"><span id="kpClearLabel">清除</span></label></div></div>'
  + '<div class="kp-actions"><button type="button" id="kpAdd" hidden>加入来源链</button><button type="button" class="primary" id="kpSave">保存</button><button type="button" id="kpCancel">取消</button></div>'
  + '<div class="kp-msg" id="kpMsg"></div>';
document.body.append(kp);
makeDraggable(kp, kp.querySelector(".kp-head"));
makeDraggable(byId("customForm"), byId("customForm").querySelector(".cf-head"));
function kpMsg(text, bad) {
  const el = kp.querySelector("#kpMsg");
  el.className = "kp-msg" + (bad ? " err" : "");
  el.textContent = text || "";
}
function kpHas(name) {
  if (name === "brave") return hasBraveKey;
  if (name === "tavily") return hasTavilyKey;
  if (name === "exa") return hasExaKey;
  return false;
}
function makeDraggable(el, handle) {
  let dx = 0;
  let dy = 0;
  let dragging = false;
  const onMove = (event) => {
    if (!dragging) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(0, event.clientX - dx), Math.max(0, window.innerWidth - w - 4));
    const top = Math.min(Math.max(0, event.clientY - dy), Math.max(0, window.innerHeight - h - 4));
    el.style.left = left + "px";
    el.style.top = top + "px";
  };
  const onUp = () => {
    dragging = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  handle.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button, input, select, a, label")) return;
    const r = el.getBoundingClientRect();
    dx = event.clientX - r.left;
    dy = event.clientY - r.top;
    dragging = true;
    event.preventDefault();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
function placeKeyPop(anchor) {
  const r = anchor.getBoundingClientRect();
  kp.hidden = false;
  const w = kp.offsetWidth || 284;
  const h = kp.offsetHeight || 150;
  const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  kp.style.left = left + "px";
  kp.style.top = top + "px";
}
function openSourcePop(name, card) {
  if (!card || !name) return;
  const hasField = Boolean(KEY_FIELD[name]);
  const on = chain.includes(name);
  const full = chain.length >= MAX_SOURCES;
  kpKind = "source";
  kpName = name;
  kp.querySelector("#kpTitle").textContent = name;
  const state = kp.querySelector("#kpState");
  if (on) state.textContent = "已在来源链 #" + (chain.indexOf(name) + 1);
  else if (name === "anysearch") state.textContent = kpHas(name) ? "已保存" : "可选，留空走匿名额度";
  else if (hasField) state.textContent = kpHas(name) ? "已保存 Key" : "还没 Key";
  else state.textContent = "不需要 Key";
  const desc = card.querySelector("span");
  kp.querySelector("#kpDesc").textContent = desc ? desc.textContent : "";
  kp.querySelector("#kpKeyWrap").hidden = !hasField;
  const input = kp.querySelector("#kpInput");
  input.value = "";
  if (hasField) {
    input.placeholder = name === "anysearch" ? "粘贴 Key；不填就走匿名额度" : "粘贴 API Key，保存后卡片就亮了";
    const chk = byId(CLEAR_FIELD[name]);
    kp.querySelector("#kpClearChk").checked = chk ? chk.checked : false;
    kp.querySelector("#kpClearLabel").textContent = "清除这个 Key";
  }
  kp.querySelector("#kpSave").hidden = !hasField;
  const add = kp.querySelector("#kpAdd");
  add.hidden = false;
  add.disabled = !on && full;
  add.textContent = on ? "移出来源链" : (full ? "来源链已满" : "加入来源链");
  kpMsg("");
  placeKeyPop(card);
  if (hasField) input.focus({ preventScroll: true });
}
function openKeyPop(name, card) { openSourcePop(name, card); }
function openProxyPop(anchor) {
  kpKind = "proxy";
  kpName = "";
  kp.querySelector("#kpTitle").textContent = "借道代理";
  const state = byId("proxyState");
  kp.querySelector("#kpState").textContent = state ? state.textContent : "";
  const input = kp.querySelector("#kpInput");
  input.value = "";
  input.placeholder = "http://127.0.0.1:7890；留空保留已有代理";
  kp.querySelector("#kpClearChk").checked = byId("clearProxy").checked;
  kp.querySelector("#kpClearLabel").textContent = "清除代理";
  kpMsg("");
  placeKeyPop(anchor);
  input.focus({ preventScroll: true });
}
function closeKeyPop() { kp.hidden = true; kpName = ""; kpKind = ""; }
function submitPage() {
  const form = byId("f");
  if (form && form.requestSubmit) form.requestSubmit();
  else if (form) form.dispatchEvent(new Event("submit", { cancelable: true }));
}
kp.querySelector("#kpSave").onclick = () => {
  const value = kp.querySelector("#kpInput").value.trim();
  const clear = kp.querySelector("#kpClearChk").checked;
  if (!value && !clear) { kpMsg(kpKind === "proxy" ? "填地址，或勾上「清除代理」" : "先粘贴 Key，或勾上「清除」", true); return; }
  if (kpKind === "key" || kpKind === "source") {
    if (!KEY_FIELD[kpName]) { kpMsg("这个来源没有可保存的 Key", true); return; }
    const field = byId(KEY_FIELD[kpName]);
    if (!field) { kpMsg("页面里没有对应输入框", true); return; }
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    if (CLEAR_FIELD[kpName]) byId(CLEAR_FIELD[kpName]).checked = clear;
  } else if (kpKind === "proxy") {
    byId("proxyUrl").value = value;
    byId("clearProxy").checked = clear;
  } else return;
  closeKeyPop();
  submitPage();
};
kp.querySelector("#kpAdd").onclick = () => {
  const name = kpName;
  if (!name) return;
  const msg = byId("chainMsg");
  if (chain.includes(name)) {
    chain = chain.filter((item) => item !== name);
    renderChain();
    msg.className = "chain-msg";
    msg.textContent = "已移出：" + name + "，记得点右上「保存」";
  } else {
    if (chain.length >= MAX_SOURCES) { kpMsg("来源链已满（最多 " + MAX_SOURCES + " 个），先删一个", true); return; }
    chain.push(name);
    renderChain();
    msg.className = "chain-msg ok";
    msg.textContent = "已加入：" + name + "（第 " + chain.length + " 个），记得点右上「保存」";
  }
  openSourcePop(name, document.querySelector('.preset[data-provider="' + name + '"]'));
};
kp.querySelector("#kpCancel").onclick = closeKeyPop;
byId("proxyOpen").onclick = () => openProxyPop(byId("proxyOpen"));
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!kp.hidden) { closeKeyPop(); return; }
  if (!byId("customForm").hidden) customForm(false);
});
document.addEventListener("click", (event) => {
  const target = event.target;
  const inside = (el) => el && el.contains(target);
  if (!kp.hidden && !inside(kp) && !(target.closest && (target.closest(".more") || target.closest("#proxyOpen")))) closeKeyPop();
  if (!byId("customForm").hidden && !inside(byId("customForm")) && !(target.closest && target.closest("#customNew"))) customForm(false);
}, true);
for (const [name, id] of Object.entries(KEY_FIELD)) {
  const input = byId(id);
  if (!input) continue;
  input.addEventListener("input", () => {
    const has = Boolean(input.value.trim());
    if (name === "brave") hasBraveKey = has;
    else if (name === "tavily") hasTavilyKey = has;
    else if (name === "exa") hasExaKey = has;
    renderPresets();
  });
}
async function probe(body, msgEl) {
  msgEl.className = "chain-msg";
  msgEl.textContent = "\u6d4b\u8bd5\u4e2d\u2026";
  try {
    const res = await fetch("/plugins/search-engine/probe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || ("HTTP " + res.status));
    msgEl.className = "chain-msg " + (data.ok ? "ok" : "err");
    msgEl.textContent = (data.ok ? "\u901a " : "\u6ca1\u901a ") + data.ms + " ms \u00b7 " + (data.detail || "");
  } catch (error) {
    msgEl.className = "chain-msg err";
    msgEl.textContent = "\u8bf7\u6c42\u5931\u8d25\uff1a" + (error && error.message ? error.message : error);
  }
}
byId("tagSel").onchange = () => {
  const tag = byId("tagSel").value;
  if (!tag) return;
  byId("tagInput").value = tag;
  byId("paramsInput").value = tag === "finance.quote" ? '{"type":"stock"}' : '{"type":"cve","value":"CVE-2024-3094"}';
};
byId("probeVertical").onclick = () => {
  const tag = byId("tagInput").value.trim();
  if (!tag) { byId("vMsg").className = "chain-msg err"; byId("vMsg").textContent = "先填 tag"; return; }
  let params;
  const raw = byId("paramsInput").value.trim();
  if (raw) {
    try { params = JSON.parse(raw); } catch (error) { byId("vMsg").className = "chain-msg err"; byId("vMsg").textContent = "params 不是合法 JSON"; return; }
  }
  probe({ tag: tag, params: params, query: byId("vQuery").value.trim() || undefined }, byId("vMsg"));
};

function show(data) {
  const c = data.config;
  revision = data.revision;
  hasBraveKey = Boolean(c.hasBraveApiKey);
  hasTavilyKey = Boolean(c.hasTavilyApiKey);
  hasExaKey = Boolean(c.hasExaApiKey);
  customs = (c.customSources || []).map(item => ({ ...item }));
  chain = [...c.searchProviders];
  renderChain();
  for (const id of ["resultsLimit", "concurrency", "maxTextChars", "referenceTtlSeconds"]) byId(id).value = c[id];
  byId("anysearchZone").value = c.anysearchZone;
  byId("timeoutSeconds").value = c.timeoutMs / 1000;
  byId("pageKiB").value = c.maxPageBytes / 1024;
  byId("imageKiB").value = c.maxImageBytes / 1024;
  for (const id of ["braveApiKey", "anysearchApiKey", "tavilyApiKey", "exaApiKey", "proxyUrl"]) byId(id).value = "";
  for (const id of ["clearBraveApiKey", "clearAnySearchApiKey", "clearTavilyApiKey", "clearExaApiKey", "clearProxy"]) byId(id).checked = false;
  byId("keyState").textContent = c.hasBraveApiKey ? "已保存 Key，原值不回传页面。" : "未设置；brave 来源需要它。";
  byId("tavilyState").textContent = c.hasTavilyApiKey ? "已保存 Key，原值不回传页面。" : "未设置；tavily 来源需要它。";
  byId("exaState").textContent = c.hasExaApiKey ? "已保存 Key，原值不回传页面。" : "未设置；exa 来源需要它。";
  byId("anyState").textContent = c.hasAnySearchApiKey ? "已保存 Key，原值不回传页面。" : "未设置；不带 Key 走匿名额度。";
  byId("proxyState").textContent = c.hasProxy ? "已有代理，地址和凭据不回传页面。" : "当前直连。";
  byId("scholarEnabled").checked = Boolean(c.scholarEnabled);
  byId("scholarMailto").value = c.scholarMailto || "";
  for (const box of document.querySelectorAll(".scholar-src")) box.checked = (c.scholarSources || []).includes(box.value);
  byId("save").disabled = false;
}

async function load() {
  byId("save").disabled = true;
  byId("msg").className = "";
  byId("msg").textContent = "读取中…";
  try {
    const res = await fetch("/plugins/search-engine/config", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    show(await res.json());
    byId("msg").textContent = "";
  } catch (error) {
    byId("msg").className = "err";
    byId("msg").textContent = "读取设置失败：" + (error && error.message ? error.message : error);
  }
}

const CUSTOM_FIELDS = { cName: "name", cUrl: "url", cMethod: "method", cItems: "items", cTitle: "title", cLink: "link", cSnippet: "snippet", cKey: "key" };
let customEdit = -1;
function placeCustom(anchor) {
  const f = byId("customForm");
  const target = anchor || byId("customNew");
  const r = target.getBoundingClientRect();
  f.hidden = false;
  const w = f.offsetWidth;
  const h = f.offsetHeight;
  const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  f.style.left = left + "px";
  f.style.top = top + "px";
}
function customForm(open, anchor, index) {
  const f = byId("customForm");
  byId("cMsg").textContent = "";
  byId("cMsg").className = "chain-msg";
  if (!open) { f.hidden = true; customEdit = -1; return; }
  const edit = typeof index === "number" ? index : -1;
  customEdit = edit;
  const item = edit >= 0 ? customs[edit] : null;
  for (const [id, key] of Object.entries(CUSTOM_FIELDS)) byId(id).value = item ? (item[key] || "") : "";
  byId("cMethod").value = item && item.method === "POST" ? "POST" : "GET";
  byId("customTitle").textContent = item ? "编辑来源 · " + item.name : "新自定义来源";
  byId("cName").readOnly = Boolean(item);
  byId("cSave").textContent = item ? "保存修改" : "加到列表";
  placeCustom(anchor);
  byId("cName").focus({ preventScroll: true });
}
function openCustomEdit(index, card) {
  if (!(index >= 0) || !customs[index]) return;
  customForm(true, card, index);
}
byId("customNew").onclick = () => {
  if (customs.length >= CUSTOM_MAX) { const m = byId("chainMsg"); m.className = "chain-msg err"; m.textContent = "自定义最多 " + CUSTOM_MAX + " 条，先删一条"; return; }
  customForm(true, byId("customNew"), -1);
};
byId("cCancel").onclick = () => customForm(false);
byId("cProbe").onclick = async () => {
  const msg = byId("cMsg");
  const url = byId("cUrl").value.trim();
  if (!url) { msg.className = "chain-msg err"; msg.textContent = "先填地址"; return; }
  msg.className = "chain-msg";
  msg.textContent = "探一次中…";
  try {
    const res = await fetch("/plugins/search-engine/probe-json", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url, method: byId("cMethod").value, key: byId("cKey").value.trim() || undefined }) });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) { msg.className = "chain-msg err"; msg.textContent = "没探到 " + (data.ms || 0) + " ms · " + (data.detail || "HTTP " + res.status); return; }
    byId("cItems").value = data.items || "";
    byId("cTitle").value = data.title || "";
    byId("cLink").value = data.link || "";
    byId("cSnippet").value = data.snippet || "";
    msg.className = "chain-msg ok";
    msg.textContent = "通了 " + data.ms + " ms · " + data.detail + (data.fields && data.fields.length ? " · 字段：" + data.fields.join(", ") : "");
  } catch (error) {
    msg.className = "chain-msg err";
    msg.textContent = "请求失败：" + (error && error.message ? error.message : error);
  }
};
byId("cSave").onclick = () => {
  const msg = byId("cMsg");
  const draft = {};
  for (const [id, key] of Object.entries(CUSTOM_FIELDS)) draft[key] = byId(id).value.trim();
  if (!CUSTOM_NAME.test(draft.name)) { msg.className = "chain-msg err"; msg.textContent = "名字只能是小写字母、数字、下划线、连字符，1–24 位"; return; }
  if (customs.some((item, i) => i !== customEdit && item.name === draft.name)) { msg.className = "chain-msg err"; msg.textContent = "已经有同名的自定义来源"; return; }
  if (!/^https?:[/][/]/i.test(draft.url) || !draft.url.includes("{query}")) { msg.className = "chain-msg err"; msg.textContent = "地址要以 http(s):// 开头，并且带 {query}"; return; }
  if (!draft.items || !draft.title || !draft.link) { msg.className = "chain-msg err"; msg.textContent = "结果数组、标题字段、链接字段都要填"; return; }
  const editing = customEdit;
  if (editing >= 0) {
    const old = customs[editing].name;
    customs[editing] = draft;
    if (chain.includes("custom:" + old)) chain[chain.indexOf("custom:" + old)] = "custom:" + draft.name;
  } else customs.push(draft);
  renderChain();
  customForm(false);
  const ok = byId("chainMsg");
  ok.className = "chain-msg ok";
  ok.textContent = (editing >= 0 ? "已改好：" : "已加进列表：") + draft.name + "，点它加进来源链，再点右上「保存」";
};
byId("refresh").onclick = load;
byId("scholarProbe").onclick = async () => {
  const msg = byId("scholarMsg");
  msg.className = "chain-msg";
  msg.textContent = "请求中…";
  try {
    const res = await fetch("/plugins/search-engine/scholar-probe", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: byId("scholarSrcSel").value, query: byId("scholarQuery").value.trim() || undefined }) });
    const data = await res.json().catch(() => ({}));
    msg.className = data.ok ? "chain-msg" : "chain-msg err";
    msg.textContent = data.ok ? ("通 " + data.ms + " ms · " + data.detail) : ("没通 " + data.ms + " ms · " + data.detail);
  } catch (error) {
    msg.className = "chain-msg err";
    msg.textContent = "没通 · " + (error && error.message ? error.message : error);
  }
};

byId("f").onsubmit = async (event) => {
  event.preventDefault();
  const config = {};
  for (const id of ["resultsLimit", "concurrency", "maxTextChars", "referenceTtlSeconds"]) config[id] = Number(byId(id).value);
  config.searchProviders = chain.slice();
  config.anysearchZone = byId("anysearchZone").value;
  config.timeoutMs = Number(byId("timeoutSeconds").value) * 1000;
  config.maxPageBytes = Number(byId("pageKiB").value) * 1024;
  config.maxImageBytes = Number(byId("imageKiB").value) * 1024;
  for (const id of ["braveApiKey", "anysearchApiKey", "tavilyApiKey", "exaApiKey", "proxyUrl"]) config[id] = byId(id).value;
  for (const id of ["clearBraveApiKey", "clearAnySearchApiKey", "clearTavilyApiKey", "clearExaApiKey", "clearProxy"]) config[id] = byId(id).checked;
  config.customSources = customs.map(item => ({ name: item.name, url: item.url, method: item.method,
    items: item.items, title: item.title, link: item.link, snippet: item.snippet || "", key: item.key || "" }));
  config.scholarEnabled = byId("scholarEnabled").checked;
  config.scholarMailto = byId("scholarMailto").value.trim();
  config.scholarSources = [...document.querySelectorAll(".scholar-src")].filter(box => box.checked).map(box => box.value);
  if (config.scholarSources.length === 0) { byId("msg").className = "err"; byId("msg").textContent = "学术来源至少勾一个"; return; }
  byId("save").disabled = true;
  byId("msg").className = "";
  byId("msg").textContent = "保存中…";
  try {
    const res = await fetch("/plugins/search-engine/config", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: revision, config: config }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error((body.error && body.error.message) || ("HTTP " + res.status));
    show(body);
    byId("msg").textContent = "已保存，设置即时生效";
  } catch (error) {
    byId("msg").className = "err";
    byId("msg").textContent = "没存上：" + (error && error.message ? error.message : error);
  } finally {
    byId("save").disabled = false;
  }
};
load();
</script></body></html>`;
