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
.chain{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
@media(max-width:1180px){.chain{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:820px){.chain{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.chain{grid-template-columns:minmax(0,1fr)}}
.chain-row.primary{border-width:2px}
.chain-zone{border:1px dashed #dcdfe6;border-radius:10px;padding:6px 10px;margin-top:6px}
.chain-zone.empty{padding:3px 10px;flex-direction:row;align-items:baseline;gap:8px;flex-wrap:wrap}
.chain-zone.empty>ul{display:none}
.chain-zone.empty>.tier-tag{margin:0}
.chain-zone.over{border-color:#7c5cff;background:rgba(124,92,255,.04)}
.chain-zone>.tier-tag{display:block;font-size:12px;color:#7a8090;margin-bottom:4px}
.chain-zone>.tier-note{display:block;font-size:12px;color:#9aa0b0;margin-top:4px;font-style:normal}
.chain-zone.empty>.tier-note{margin:0}
.chain-row .chain-weight{justify-self:end;font-size:12px;padding:2px 2px;max-width:74px}
.chain-standby-pick{font-size:11px;padding:1px 3px;width:44px;max-width:92px;min-width:0;border:1px solid rgba(124,92,255,.45);border-radius:6px;background:rgba(124,92,255,.08);color:#6d4aff;font-family:inherit;cursor:pointer;line-height:16px}
.chain-standby-pick.unset{color:#9aa0b0;border-color:rgba(127,127,127,.3);background:transparent}
.chain-standby-pick:not(.unset){width:auto}
.chain-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:6px 8px;padding:8px 10px;border:1px solid rgba(124,92,255,.45);border-radius:9px;background:rgba(124,92,255,.06);box-shadow:0 0 0 1px rgba(124,92,255,.18),0 2px 10px rgba(124,92,255,.14),0 0 16px rgba(124,92,255,.10);font-size:13px;cursor:grab}
.chain-row:hover{box-shadow:0 0 0 1px rgba(124,92,255,.55),0 3px 14px rgba(124,92,255,.24),0 0 22px rgba(124,92,255,.20)}
.chain-row.drag{opacity:.45}
.chain-row.over{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.3),0 0 22px rgba(124,92,255,.26)}
.chain-row .grip{color:#9aa0b0;letter-spacing:-1px;user-select:none}
.chain-row b{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chain-row em{font-style:normal;font-size:12px;color:#9aa0b0}
.chain-btns{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:5px}
.chain-btns button{background:transparent;border:1px solid rgba(127,127,127,.3);color:inherit;border-radius:6px;padding:2px 7px;font-size:11px;cursor:pointer;font-family:inherit}
.chain-btns button:hover{border-color:#7c5cff;color:#6d4aff}
.chain-btns button:disabled{opacity:.4;cursor:default}
.chain-btns button.del-x{border-color:transparent;background:transparent;color:#9ca3af;font-size:15px;line-height:1;padding:2px 7px}
.chain-btns .del-x{margin-left:auto}
.chain-btns button.del-x:hover{border-color:rgba(107,114,128,.4);color:#4b5563;background:rgba(107,114,128,.08)}
.probe-out{margin-top:8px;font-size:12px;color:#4b5563;border:1px solid rgba(124,92,255,.25);border-radius:8px;padding:8px 10px;background:rgba(124,92,255,.04);max-height:280px;overflow:auto}
.probe-out .po-head{color:#6d4aff;margin-bottom:4px}
.probe-out .po-seg{margin-top:6px}
.probe-out .po-seg:first-of-type{margin-top:0}
.probe-out .po-title{font-weight:600}
.probe-out .po-item{color:#6b7280;padding-left:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
.keypop .kp-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.keypop .kp-actions button{white-space:nowrap;padding:4px 10px;font-size:12px;border:1px solid rgba(127,127,127,.34);border-radius:7px;background:transparent;color:inherit;cursor:pointer;font-family:inherit}
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
.src-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:8px;margin-top:8px}
.src-card{position:relative;display:flex;flex-direction:column;gap:3px;padding:9px 30px 10px 11px;border:1px solid rgba(127,127,127,.3);border-radius:9px;cursor:pointer;transition:border-color .12s,box-shadow .12s,background .12s}
.src-card:hover{border-color:#7c5cff}
.src-card input{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
.src-card b{font-size:13px;font-weight:600}
.src-card span{font-size:12px;color:#797e8c;line-height:1.45}
.src-card em{font-size:11px;font-style:normal;color:#9aa0b0}
.src-card::after{content:"";position:absolute;top:9px;right:10px;width:14px;height:14px;border:1px solid rgba(127,127,127,.45);border-radius:4px;line-height:14px;text-align:center;font-size:10px}
.src-card[draggable="true"]{cursor:grab}
.src-card[draggable="true"]{padding-left:24px}
.src-card[draggable="true"]::before{content:"\u2261";position:absolute;left:8px;top:8px;font-size:12px;line-height:1;color:#9aa0b0}
.src-card.drag{opacity:.45}
.src-card.over{border-color:#7c5cff;background:rgba(124,92,255,.10)}
.src-card.on{border-color:#7c5cff;background:rgba(124,92,255,.07)}
.src-card.on:hover{border-color:#6d4aff}
.src-grid.drag-on .src-card.on{border-color:rgba(124,92,255,.35)}
.src-card.on::after{content:"✓";background:#7c5cff;border-color:#7c5cff;color:#fff}
.src-card.on em{color:#15803d}
.src-card.add{font:inherit;text-align:left;color:inherit;background:transparent;border-style:dashed}
.src-card.add em{color:#7c5cff}
.src-card .more{position:absolute;top:6px;right:28px;width:16px;height:16px;line-height:14px;text-align:center;font-style:normal;font-size:12px;color:#9aa0b0;border-radius:4px;cursor:pointer}
.src-card .more:hover{background:rgba(124,92,255,.14);color:#7c5cff}
.preset b{font-size:13px}
.preset span{font-size:12px;color:#797e8c;line-height:1.45}
.preset em{font-size:11px;color:#6d4aff;font-style:normal}
.preset.on{cursor:default;border-color:rgba(124,92,255,.45);background:rgba(124,92,255,.06)}
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
<button type="button" class="pg-tab" data-goto="scholar">学术</button>
<button type="button" class="pg-tab" data-goto="facts">事实</button>
<button type="button" class="pg-tab" data-goto="search">搜索</button>
<button type="button" class="pg-tab" data-goto="read">读取</button>
</div><div class="pg-actions"><button class="btn" type="button" id="refresh">重新读取</button><button class="btn primary" type="submit" form="f" id="save" disabled>保存</button><span id="msg"></span></div></div>
<div class="panel-body"><form id="f">

<section class="pg-group" id="pg-source">
<p class="pg-desc">搜索来源是一条链，两种用法：聚合（默认）是链上几家同时打、各自成段列出、只标重复；顺序回退是按链一家家试、前一家失败才换下一家。分两级——一级权重高、首位可以挂一个回退来源；二级便宜、只作兜底，自己不挂回退。权重只决定这一家分到多少字，不决定谁排前面：结果不排序，谁更相关我们判不了。</p>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">搜索来源（有序，可拖动排序）</span>
<div id="tierBox">
<div class="chain-zone" data-tier="1">
<span class="tier-tag">一级 · 权重高，首位可以挂一个回退</span>
<ul id="chain" class="chain"></ul>
<em class="tier-note" id="tierNote1"></em>
</div>
<div class="chain-zone" data-tier="2">
<span class="tier-tag">二级 · 便宜兜底，权重低，不设回退</span>
<ul id="chain2" class="chain"></ul>
<em class="tier-note" id="tierNote2"></em>
</div>
</div>
<div id="chainMsg" class="chain-msg" style="margin-top:10px;min-height:1em"></div>
<div class="pg-tools"><button type="button" class="btn" id="proxyOpen">代理设置</button><span class="pg-hint" style="margin:0" id="proxyState"></span></div>
<div class="presets" id="presets">
  <div class="preset-group"><span class="preset-title">无需 Key</span>
    <div class="preset" role="button" tabindex="0" data-provider="anysearch" data-needkey="0"><b>anysearch</b><span>聚合搜索，不带 Key 走匿名额度；分 cn / intl 两区，垂直频道只有它支持</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
    <div class="preset" role="button" tabindex="0" data-provider="duckduckgo" data-needkey="0"><b>duckduckgo</b><span>解析结果页 HTML，不需要 Key；对方改版就可能失效</span><em>点一下加进来</em><i class="more" title="设置" role="button" tabindex="0">⋯</i></div>
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

<input type="hidden" name="searchProviders" id="searchProviders">
<div id="hiddenFields" hidden>
<div class="pg-item"><label class="pg-row"><span class="pg-label">借道代理</span><input type="password" name="proxyUrl" id="proxyUrl" autocomplete="new-password"></label>
<span class="pg-check"><input id="clearProxy" type="checkbox" name="clearProxy"></span></div>
<div class="pg-item"><input type="password" name="braveApiKey" id="braveApiKey" autocomplete="new-password"><p class="pg-hint" id="keyState"></p><input id="clearBraveApiKey" type="checkbox" name="clearBraveApiKey"></div>
<div class="pg-item"><input type="password" name="tavilyApiKey" id="tavilyApiKey" autocomplete="new-password"><p class="pg-hint" id="tavilyState"></p><input id="clearTavilyApiKey" type="checkbox" name="clearTavilyApiKey"></div>
<div class="pg-item"><input type="password" name="exaApiKey" id="exaApiKey" autocomplete="new-password"><p class="pg-hint" id="exaState"></p><input id="clearExaApiKey" type="checkbox" name="clearExaApiKey"></div>
<div class="pg-item"><input type="password" name="anysearchApiKey" id="anysearchApiKey" autocomplete="new-password"><p class="pg-hint" id="anyState"></p><input id="clearAnySearchApiKey" type="checkbox" name="clearAnySearchApiKey"></div>
</div>

<p class="pg-hint">拖 ≡ 调整顺序（可跨一级/二级），前一个失败才换下一个；第一个来源拿剩余预算的七成。「试一下」直连该来源一次，不改配置、不写回执。brave / tavily / exa 各要自己的 Key——点卡片右上角「⋯」打开设置（可拖动），没填 Key 的卡片会灰着；anysearch 不带 Key 就能用。代理在「代理设置」里。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">每次默认结果数</span><input type="number" name="resultsLimit" id="resultsLimit" min="1" max="10" required></label>
<p class="pg-hint">范围 1–10。摘要不代表已阅读原网页，要正文得用 search_read。</p></div>
<div class="pg-item"><label class="pg-row"><span class="pg-label">AnySearch 区域</span><select name="anysearchZone" id="anysearchZone"><option value="cn">cn 国内</option><option value="intl">intl 国际</option></select></label>
<p class="pg-hint">只在请求 anysearch 时作为默认 zone；单次搜索可以用 search_vertical 的 zone 参数覆盖。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">搜索方式</span><select name="searchMode" id="searchMode"><option value="hybrid">首位为主 + 其余并发（首位没拿到结果时主位按链顺序顺延，不额外发请求）</option><option value="aggregate">聚合并发（默认；全，几家同时打、分段列出，不分主次）</option><option value="fallback">顺序回退（省，一次只打一家，拿到就停）</option></select></label>
<p class="pg-hint">回退：按来源链一家家试，前一家失败才换下一家，拿到结果就停——一次只付一份开销。聚合：链上所有来源同时发请求，各自成段原样列出，不排序、不合并，只标出重复（同一条链接被几家给出的，后来的带 dupOf，顶层给 overlap）。聚合的结果在回执的 groups 里，顶层 results 为空。开销是几倍，换来的是"一家漏了另一家能补上"。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">聚合一次并发几家</span><input type="number" name="aggregateConcurrency" id="aggregateConcurrency" min="1" max="5" required></label>
<p class="pg-hint">1–5，默认 2。先并发打链上前几家，去重后的条目还不够「默认结果数」时再补下一家，够就停。链序就是主次：一级在前、二级在后。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">结果总量上限（字符）</span><input type="number" name="resultsMaxChars" id="resultsMaxChars" min="0" max="40000" required></label>
<p class="pg-hint">按序列化后的长度算，不是字数。十条各带一千字摘要就是一万字进上下文、之后每轮重发。超出时先截断最后一条的摘要，再超出就丢掉后面的条目；0 = 不限。默认 8000。</p></div>
<div class="pg-item"><span class="pg-label">被截断时回执长什么样</span><p class="pg-hint" style="margin-top:0">results 里条目变少，多一个 truncated 字段写着丢了几条；摘要被切的那条末尾带省略号。至少保留一条，不会因此变成"零条结果"。</p></div>
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
<div class="pg-item"><label class="pg-row"><span class="pg-label">结果缓存（秒）</span><input type="number" name="cacheSeconds" id="cacheSeconds" min="0" max="3600" required></label><p class="pg-hint">同样的词、同样的来源链，这个时间内直接回上次拿到的那份，不再发请求；0 = 不缓存。只缓存有结果的，失败和零条都会重新去问。上限 3600。</p></div>
<div class="pg-item"><span class="pg-label">命中时会看到什么</span><p class="pg-hint" style="margin-top:0">回执里带 cached: true 和 cachedAgoMs：这次没发请求，结果是 N 毫秒前那次拿到的。来源链、Key、代理一改，缓存整表清空。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">连续失败几次进冷却</span><input type="number" name="sourceFailThreshold" id="sourceFailThreshold" min="1" max="10" required></label><p class="pg-hint">同一个来源连续失败这么多次，就把它暂时从链上放过；成功一次就清零。只算真失败（超时、HTTP 错误、解析失败），"连上但零条"算应答，不记账。上限 10。</p></div>
<div class="pg-item"><label class="pg-row"><span class="pg-label">冷却多少秒</span><input type="number" name="sourceCooldownSeconds" id="sourceCooldownSeconds" min="0" max="600" required></label><p class="pg-hint">冷却期内这个来源会被跳过，回执里记 source_cooling 和还剩几秒，不再拿预算去撞同一堵墙。0 = 不冷却。上限 600。<b>链上所有来源都在冷却时会硬打一遍</b>——宁可慢一次，也不让搜索空手回去。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">垂直搜索参数</span>
<p class="pg-hint" style="margin-top:0">tag 走 AnySearch 的垂直频道，多数还要配 params。实测可用的两组：tag=finance.quote + params { type: 'stock' }；tag=security.vuln + params { type: 'cve', value: 'CVE-2024-3094' }。zone 是 cn / intl，language 例如 zh-CN、en。这些都按次传入，这里不设默认值；不传 zone 就用上面那个区域。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">垂直搜索试一下</span>
<div class="chain-add"><select id="tagSel" class="chain-sel" title="带 * 的必须配 params"><option value="">（自定义 tag）</option><optgroup label="academic · 学术"><option value="academic.citation">academic.citation *</option><option value="academic.dataset">academic.dataset</option><option value="academic.paper">academic.paper</option><option value="academic.person">academic.person</option></optgroup><optgroup label="finance · 金融"><option value="finance.calendar">finance.calendar *</option><option value="finance.fundamental">finance.fundamental *</option><option value="finance.macro">finance.macro *</option><option value="finance.news">finance.news *</option><option value="finance.quote">finance.quote *</option><option value="finance.screen">finance.screen *</option></optgroup><optgroup label="security · 安全"><option value="security.intel">security.intel *</option><option value="security.noise">security.noise *</option><option value="security.scan">security.scan *</option><option value="security.vuln">security.vuln *</option></optgroup><optgroup label="legal · 法律"><option value="legal.enforcement">legal.enforcement</option><option value="legal.judicial">legal.judicial</option><option value="legal.legislation">legal.legislation</option></optgroup><optgroup label="code · 代码"><option value="code.doc">code.doc *</option><option value="code.snippet">code.snippet</option></optgroup><optgroup label="travel · 出行"><option value="travel.flight">travel.flight *</option><option value="travel.flight_status">travel.flight_status *</option></optgroup><optgroup label="business · 商业"><option value="business.company">business.company</option><option value="business.jobs">business.jobs</option><option value="business.people">business.people</option><option value="business.trade">business.trade</option></optgroup></select><input type="text" id="tagInput" class="chain-sel" placeholder="tag"><input type="text" id="paramsInput" class="chain-sel" style="min-width:240px" placeholder="params JSON">
<input type="text" id="vQuery" class="chain-sel" placeholder="查询词，留空用 whalelife"><button type="button" class="btn" id="probeVertical">试一下</button><span class="chain-msg" id="vMsg"></span></div>
<p class="pg-hint">下拉里是按域分好组的 25 个真实 tag，带 <b>*</b> 的必须配 params，选完会自动补一份骨架（值是空的，要自己填）。裸 tag 会被来源拒绝，报错里会带回它的原话。这一栏只发一次真请求，不改任何配置。</p></div>
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

<div class="pg-item"><span class="pg-label">结构化读取</span>
<span class="pg-check"><input id="structuredRead" type="checkbox" name="structuredRead"><span class="pg-label">命中 GitHub / Stack Exchange / arXiv / 维基百科时改走公开 API</span></span>
<p class="pg-hint">取的是结构化字段，不是页面快照：GitHub 的 issue / PR / release 会拆出状态、标签、正文和评论；Stack Exchange 的回答按票数排、已采纳的排在前面；arXiv 取元数据与摘要；维基百科取纯文本正文。这几个接口都不需要 Key。解析没成会回落成普通抓取，回执里写明原因。</p></div>
<div class="pg-item" style="margin-top:16px"><span class="pg-label">对外接口</span>
<p class="pg-hint" style="margin-top:0">别的程序（脚本、别的 agent）可以按令牌调 search / scholar / facts / status。不开放“读网页”——那等于把任意 URL 的出口借出去。令牌空着就是不开放，填了保存后立刻生效；要关就勾「清掉已设的令牌」再保存。保存后页面不再显示明文。</p></div>
<div class="pg-pair">
<div class="pg-item"><label class="pg-row"><span class="pg-label">令牌（16–128 位字母数字）</span><input type="text" name="apiToken" id="apiToken" autocomplete="off" placeholder="留空 = 不开放"></label>
<p class="pg-hint">存盘后页面不再显示明文，只显示「已设置」。谁拿到都能花你的额度，勾下面那个再保存即可关闭。</p>
<label class="pg-row" style="margin-top:6px"><input type="checkbox" id="apiTokenClear"> <span>清掉已设的令牌（等于关闭对外接口）</span></label></div>
<div class="pg-item"><span class="pg-label">生成一个</span>
<p class="pg-hint" style="margin-top:0"><button type="button" class="btn" id="apiGen">随机生成</button> 生成完要点右上角「保存」才落盘。</p></div>
</div>
<div class="pg-item"><span class="pg-label">怎么调</span>
<p class="pg-hint" style="margin-top:0">接口走宿主的登录态，第一步先拿 cookie（网页没设密码时这么拿）：</p>
<p class="pg-hint" style="margin-top:0">1. curl -i -X POST http://127.0.0.1:9270/api/login -H "Content-Type: application/json" -d "{\"password\":\"\"}"　→ 从 Set-Cookie 里取 whale=…</p>
<p class="pg-hint" style="margin-top:0">2. curl -X POST http://127.0.0.1:9270/plugins/search-engine/api -H "Content-Type: application/json" -H "x-search-token: 你的令牌" -H "Cookie: whale=…" -d "{\"tool\":\"search\",\"query\":\"prompt caching\",\"limit\":5}"</p>
<p class="pg-hint" style="margin-top:0">tool 可传 search（query / limit / more / tag / params / zone / language）、scholar（query / limit / sources / yearMin）、facts（query / limit / sources / lang）、status。回执和工具那边同一份。</p></div>
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
<div class="pg-item"><label class="pg-row"><span class="pg-label">Semantic Scholar API Key（可选）</span><input type="password" name="semanticScholarApiKey" id="semanticScholarApiKey" autocomplete="new-password"></label>
<p class="pg-hint" id="s2KeyState"></p><label class="pg-check"><input id="clearSemanticScholarApiKey" type="checkbox"><span class="pg-label">清除这个 Key</span></label>
<p class="pg-hint">不填就走匿名，匿名配额极低，实测几乎每次 429；填了放进 x-api-key 头。其余四家都不要 Key。</p></div>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">来源（勾选即启用，按这里列出的顺序回退）</span>
<div class="src-grid">
<label class="src-card" draggable="true"><input type="checkbox" class="scholar-src" value="arxiv"><b>arXiv</b><span>预印本，全文免费，只有 XML</span><em class="src-flag">未启用</em></label>
<label class="src-card" draggable="true"><input type="checkbox" class="scholar-src" value="openalex"><b>OpenAlex</b><span>覆盖面最广，带被引数</span><em class="src-flag">未启用</em></label>
<label class="src-card" draggable="true"><input type="checkbox" class="scholar-src" value="crossref"><b>Crossref</b><span>期刊注册库，DOI 最全</span><em class="src-flag">未启用</em></label>
<label class="src-card" draggable="true"><input type="checkbox" class="scholar-src" value="semanticscholar"><b>Semantic Scholar</b><span>无 Key 时常报 429</span><em class="src-flag">未启用</em></label>
<label class="src-card" draggable="true"><input type="checkbox" class="scholar-src" value="europepmc"><b>Europe PMC</b><span>生命科学文献库，含预印本</span><em class="src-flag">未启用</em></label>
<div id="scholarCustomCards" style="display:contents"></div>
<button type="button" class="src-card add" id="scholarCustomNew"><b>+ 自定义来源</b><span>返回 JSON 的接口，跟内置几家共用这条回退链</span><em>点一下填接口</em></button>
</div>
<p class="pg-hint">前一个连不上才换下一个；连上但零条算应答，会记进回退链再试下一个。五家里只有 Semantic Scholar 可能要 Key，其余都不要。想临时换顺序或只查某一个，用工具参数 sources。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">试一下</span>
<div class="pg-item"><select id="scholarSrcSel"><option value="arxiv">arXiv</option><option value="openalex">OpenAlex</option><option value="crossref">Crossref</option><option value="semanticscholar">Semantic Scholar</option><option value="europepmc">Europe PMC</option></select>
<input type="text" id="scholarQuery" placeholder="检索词，例如 transformer attention"></div>
<button class="btn" type="button" id="scholarProbe">试一下</button> <span class="chain-msg" id="scholarMsg"></span> <button class="btn" type="button" id="scholarProbeAll">五家一起</button>
<p class="pg-hint">「试一下」只打选中那一家；「四家一起」按当前链上的来源并发打一轮，各自成段列出。两个都不改配置、不写回执。</p><div class="probe-out" id="scholarOut" hidden></div></div>
</div>
</section>

<section class="pg-group" id="pg-facts" hidden>
<p class="pg-desc">事实查询是另一个工具 search_facts，默认不注册：关着时它不在工具表里，不占每轮上下文。它查的是「条目」——这个东西叫什么、编号是多少，不是网页全文检索，所以不并进上面的来源链。</p>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">开关</span>
<span class="pg-check"><input id="factsEnabled" type="checkbox" name="factsEnabled"><span class="pg-label">启用 search_facts 工具</span></span>
<p class="pg-hint">四家都是公开 API，不需要 Key。关着时模型看不到这个工具。</p></div>
<div class="pg-item"><label class="pg-row"><span class="pg-label">语言</span><select id="factsLang" name="factsLang"><option value="zh">中文</option><option value="en">英文</option></select></label>
<p class="pg-hint">只影响维基百科和维基数据的检索语言；OpenLibrary 和 OEIS 只有英文。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">来源（勾选即启用，按这里列出的顺序回退）</span>
<div class="src-grid">
<label class="src-card" draggable="true"><input type="checkbox" class="fact-src" value="wikipedia"><b>维基百科</b><span>条目搜索，带摘要</span><em class="src-flag">未启用</em></label>
<label class="src-card" draggable="true"><input type="checkbox" class="fact-src" value="wikidata"><b>维基数据</b><span>实体、编号、一句描述</span><em class="src-flag">未启用</em></label>
<label class="src-card" draggable="true"><input type="checkbox" class="fact-src" value="openlibrary"><b>OpenLibrary</b><span>图书、作者、首版年</span><em class="src-flag">未启用</em></label>
<label class="src-card" draggable="true"><input type="checkbox" class="fact-src" value="oeis"><b>OEIS</b><span>整数数列，输入例如 1,2,3,6,11</span><em class="src-flag">未启用</em></label>
<div id="factCustomCards" style="display:contents"></div>
<button type="button" class="src-card add" id="factCustomNew"><b>+ 自定义来源</b><span>返回 JSON 的接口，跟内置几家共用这条回退链</span><em>点一下填接口</em></button>
</div>
<p class="pg-hint">前一个连不上才换下一个；连上但零条算应答，会记进回退链再试下一个。四家都不需要 Key。</p></div>
</div>
<div class="pg-pair">
<div class="pg-item"><span class="pg-label">试一下</span>
<div class="pg-item"><select id="factSrcSel"><option value="wikipedia">维基百科</option><option value="wikidata">维基数据</option><option value="openlibrary">OpenLibrary</option><option value="oeis">OEIS</option></select>
<input type="text" id="factQuery" placeholder="查询词，例如 Brisbane"></div>
<button class="btn" type="button" id="factProbe">试一下</button> <span class="chain-msg" id="factMsg"></span>
<p class="pg-hint">只直连选中的那个来源一次，不改配置。语言取上面那一栏当前的值。</p></div>
</div>
</section>
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
<div class="pg-pair" id="cScholarOnly" hidden>
<label class="pg-row"><span class="pg-label">作者字段（可空）</span><input type="text" id="cAuthors" placeholder="authors；认数组或 name/display_name"></label>
<label class="pg-row"><span class="pg-label">年份字段（可空）</span><input type="text" id="cYear" placeholder="year"></label>
</div>
<div class="chain-add"><button class="btn" type="button" id="cProbe">探一下</button><button class="btn primary" type="button" id="cSave">加到列表</button><button class="btn" type="button" id="cDelete" hidden>删掉这个来源</button><button class="btn" type="button" id="cCancel">取消</button><span class="chain-msg" id="cMsg"></span></div>
<p class="pg-hint">只收 http/https、不跟随跳转——查询串不会被重发到另一个域。字段只认点路径（a.b.c），不支持数组下标。地址里没有 {query} 会被拒。POST 会发 {query, limit} 的 JSON 体。Key 存盘后不回传页面，同名留空表示沿用原值。</p>
</div>
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
function restoreSourceOrder(selector, sources) {
  const boxes = new Map([...document.querySelectorAll(selector)].map(box => [box.value, box]));
  for (const [name, box] of boxes) box.checked = sources.includes(name);
  const grids = new Set([...boxes.values()].map(box => box.closest(".src-grid")).filter(Boolean));
  for (const grid of grids) {
    // 全量稳定重排：按 sources 顺序排前面，没列进去的保持原相对顺序排后面。
    // 只把命中的往末尾 append 会把没命中的顶到前面去，看着像顺序乱了。
    const rank = (card) => {
      const box = card.querySelector("input[type=checkbox]");
      const at = box ? sources.indexOf(box.value) : -1;
      return at < 0 ? Number.MAX_SAFE_INTEGER : at;
    };
    [...grid.querySelectorAll(".src-card")]
      .map((card, idx) => ({ card, idx }))
      .sort((a, b) => rank(a.card) - rank(b.card) || a.idx - b.idx)
      .forEach(({ card }) => grid.append(card));
    // 「+ 自定义来源」永远排在最后，别夹在中间
    const addCard = grid.querySelector(".src-card.add");
    if (addCard) grid.append(addCard);
  }
}
function syncSrcCards() {
  for (const grid of document.querySelectorAll(".src-grid")) {
    let order = 0;
    for (const card of grid.querySelectorAll(".src-card")) {
      const box = card.querySelector("input[type=checkbox]");
      if (!box) continue;
      card.classList.toggle("on", box.checked);
      const flag = card.querySelector(".src-flag");
      if (box.checked) order += 1;
      if (flag) flag.textContent = box.checked ? ("已启用 \u00b7 #" + order) : "未启用";
    }
  }
}
// 学术 / 事实的来源支持拖动排序：拖到哪张卡上就插到它前面，DOM 顺序就是保存顺序。
for (const grid of document.querySelectorAll(".src-grid")) {
  grid.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".src-card");
    if (!card || !card.draggable) return;
    event.dataTransfer.setData("text/plain", "card");
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("drag");
    grid.classList.add("drag-on");
  });
  grid.addEventListener("dragend", () => {
    for (const item of grid.querySelectorAll(".over, .drag")) item.classList.remove("over", "drag");
    grid.classList.remove("drag-on");
  });
  grid.addEventListener("dragover", (event) => {
    const card = event.target.closest(".src-card");
    if (!card) return;
    event.preventDefault();
    for (const item of grid.querySelectorAll(".over")) if (item !== card) item.classList.remove("over");
    card.classList.add("over");
  });
  grid.addEventListener("drop", (event) => {
    const card = event.target.closest(".src-card");
    if (!card) return;
    event.preventDefault();
    card.classList.remove("over");
    const moving = grid.querySelector(".src-card.drag");
    if (!moving || moving === card) return;
    const box = card.getBoundingClientRect();
    const after = event.clientX > box.left + box.width / 2;
    if (after) card.after(moving); else card.before(moving);
    syncSrcCards();
  });
}
document.addEventListener("change", (event) => {
  const tag = event.target;
  if (tag && tag.matches && tag.matches(".scholar-src,.fact-src")) syncSrcCards();
});
/** 主位能选的二级：排除自己和链上已有的（它们本来就在并发里打）。 */
function standbyChoices(name) {
  const used = new Set(chain);
  const options = ["anysearch", "duckduckgo", "brave", "tavily", "exa"];
  return options.filter(item => item !== name && !used.has(item));
}
/** 主位那颗小标记：点开选一个回退来源。没设时显示 \u21ba，设了显示来源名。 */
function standbyPick(name) {
  const sel = document.createElement("select");
  sel.className = "chain-standby-pick";
  sel.draggable = false;
  sel.title = "主位没拿到结果时，换这个来源再打一次（选「\u21ba」就是不换）";
  const opts = standbyChoices(name);
  sel.innerHTML = '<option value="">\u21ba</option>'
    + opts.map(item => '<option value="' + item + '">' + item + '</option>').join("");
  const saved = fallbacks[name] || "";
  sel.value = opts.includes(saved) ? saved : "";
  sel.classList.toggle("unset", !sel.value);
  sel.addEventListener("change", () => {
    if (sel.value) fallbacks[name] = sel.value;
    else delete fallbacks[name];
    sel.classList.toggle("unset", !sel.value);
    sel.title = sel.value ? "主位没拿到结果时改用 " + sel.value + "（已记下，点保存生效）"
                          : "主位没拿到结果时，换一个来源再打一次（不设就不换）";
  });
  return sel;
}
let tiers = {};
let weights = {};
function tierOf(name) { return tiers[name] === 2 ? 2 : 1; }
function weightOf(name) {
  const value = Number(weights[name]);
  return value >= 1 && value <= 5 ? value : (tierOf(name) === 2 ? 1 : 3);
}
function groupsOf(tier) { return chain.filter(name => tierOf(name) === tier); }
/** 一级总排在二级前面；组内保持原来相对顺序。 */
function normalizeChain() {
  chain = [...chain.filter(name => tierOf(name) === 1), ...chain.filter(name => tierOf(name) === 2)];
}
function setTier(name, tier) { if (tier === 2) tiers[name] = 2; else delete tiers[name]; }
function renderRow(name, index) {
  const tier = tierOf(name);
  const list = groupsOf(tier);
  const row = document.createElement("li");
  row.className = "chain-row" + (tier === 1 && list[0] === name ? " primary" : "");
  row.draggable = true;
  row.dataset.name = name;
  row.dataset.tier = String(tier);
  const grip = document.createElement("span"); grip.className = "grip"; grip.textContent = "\u2261";
  const label = document.createElement("b"); label.textContent = name;
  const order = document.createElement("em"); order.textContent = "#" + (index + 1);
  const weight = document.createElement("select");
  weight.className = "chain-weight";
  weight.title = "权重：只决定这一家分多少字，不决定排序";
  for (const value of [1, 2, 3, 4, 5]) {
    const option = document.createElement("option");
    option.value = String(value); option.textContent = "权重 " + value;
    weight.append(option);
  }
  weight.value = String(weightOf(name));
  weight.addEventListener("change", () => { weights[name] = Number(weight.value); });
  const btns = document.createElement("span"); btns.className = "chain-btns";
  const mk = (text, act, disabled, cls) => { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.dataset.act = act; b.dataset.name = name; b.disabled = Boolean(disabled); if (cls) b.className = cls; return b; };
  const delBtn = mk("\u00d7", "del", chain.length <= 1, "del-x"); delBtn.title = "\u5220\u9664\u8fd9\u4e2a\u6765\u6e90"; btns.append(mk("\u8bd5\u4e00\u4e0b", "probe", false));
  if (tier === 1 && list[0] === name) btns.append(standbyPick(name));
  const msg = document.createElement("span"); msg.className = "chain-msg"; btns.append(msg, delBtn);
  row.append(grip, label, weight, order, btns);
  return row;
}
function renderChain() {
  normalizeChain();
  const one = byId("chain"), two = byId("chain2");
  one.textContent = ""; two.textContent = "";
  const first = groupsOf(1)[0];
  chain.forEach((name, index) => {
    const row = renderRow(name, index);
    (tierOf(name) === 2 ? two : one).append(row);
  });
  const g1 = groupsOf(1).length, g2 = groupsOf(2).length;
  one.closest(".chain-zone").classList.toggle("empty", !g1);
  two.closest(".chain-zone").classList.toggle("empty", !g2);
  byId("tierNote1").textContent = g1 ? "" : "一级还空着，从下面拖一张进来";
  byId("tierNote2").textContent = g2 ? "" : "空着也行，只在想要便宜兜底时才用";
  byId("searchProviders").value = chain.join(", ");
  renderCustoms();
  renderPresets();
}
function moveTo(name, target, after) {
  if (name === target) return;
  setTier(name, tierOf(target));
  chain.splice(chain.indexOf(name), 1);
  const at = chain.indexOf(target);
  chain.splice(after ? at + 1 : at, 0, name);
  renderChain();
}
function appendTo(tier, name) {
  chain.splice(chain.indexOf(name), 1);
  chain.push(name);
  setTier(name, tier);
  renderChain();
}
const TIER_BOX = byId("tierBox");
TIER_BOX.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-act]");
  if (!button) return;
  const name = button.dataset.name;
  const act = button.dataset.act;
  if (act === "del") {
    chain = chain.filter(item => item !== name);
    delete tiers[name]; delete weights[name]; delete fallbacks[name];
    renderChain();
  } else if (act === "probe") probe({ provider: name }, button.parentNode.querySelector(".chain-msg"));
});
TIER_BOX.addEventListener("dragstart", (event) => {
  const row = event.target.closest(".chain-row");
  if (!row) return;
  if (event.target.closest(".chain-standby-pick")) { event.preventDefault(); return; }
  event.dataTransfer.setData("text/plain", row.dataset.name);
  event.dataTransfer.effectAllowed = "move";
  row.classList.add("drag");
});
TIER_BOX.addEventListener("dragend", () => {
  for (const item of TIER_BOX.querySelectorAll(".over, .drag")) item.classList.remove("over", "drag");
});
TIER_BOX.addEventListener("dragover", (event) => {
  const zone = event.target.closest(".chain-zone");
  if (!zone) return;
  event.preventDefault();
  const row = event.target.closest(".chain-row");
  for (const item of TIER_BOX.querySelectorAll(".over")) if (item !== row) item.classList.remove("over");
  (row || zone).classList.add("over");
});
TIER_BOX.addEventListener("drop", (event) => {
  const zone = event.target.closest(".chain-zone");
  if (!zone) return;
  if (event.target.closest(".chain-standby-pick")) return;
  event.preventDefault();
  const name = event.dataTransfer.getData("text/plain");
  const row = event.target.closest(".chain-row");
  const tier = Number(zone.dataset.tier) === 2 ? 2 : 1;
  if (row && row.dataset.name && row.dataset.name !== name) {
    const box = row.getBoundingClientRect();
    moveTo(name, row.dataset.name, event.clientY > box.top + box.height / 2);
  } else appendTo(tier, name);
});

const MAX_SOURCES = 6;
let customs = [];
let scholarCustoms = [];
let factCustoms = [];
const CUSTOM_MAX = 8;
/** 学术页、事实页各有一份自定义来源，字段结构跟搜索页那份一样（学术多作者/年份）。 */
const KIND_CUSTOM = {
  scholar: { box: "scholarCustomCards", add: "scholarCustomNew", cls: "scholar-src", sel: "scholarSrcSel", label: "学术" },
  fact: { box: "factCustomCards", add: "factCustomNew", cls: "fact-src", sel: "factSrcSel", label: "事实" },
};
function kindList(scope) {
  return scope === "scholar" ? scholarCustoms : scope === "fact" ? factCustoms : customs;
}
function kindSet(scope, list) {
  if (scope === "scholar") scholarCustoms = list;
  else if (scope === "fact") factCustoms = list;
  else customs = list;
}
function renderKindCustoms(scope) {
  const cfg = KIND_CUSTOM[scope];
  const box = cfg && byId(cfg.box);
  if (!box) return;
  const checked = new Set([...document.querySelectorAll("." + cfg.cls)].filter(el => el.checked).map(el => el.value));
  box.textContent = "";
  const list = kindList(scope);
  list.forEach((item, index) => {
    const card = document.createElement("label");
    card.className = "src-card";
    card.draggable = true;
    card.dataset.customScope = scope;
    card.dataset.customIndex = String(index);
    card.dataset.customName = item.name;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = cfg.cls;
    input.value = "custom:" + item.name;
    input.checked = checked.has("custom:" + item.name);
    const name = document.createElement("b");
    name.textContent = item.name;
    const desc = document.createElement("span");
    desc.textContent = item.url + " · 数组 " + item.items;
    const flag = document.createElement("em");
    flag.className = "src-flag";
    flag.textContent = "未启用";
    const more = document.createElement("i");
    more.className = "more";
    more.title = "编辑";
    more.textContent = "\u22ef";
    card.append(input, name, desc, flag, more);
    box.append(card);
  });
  const add = byId(cfg.add);
  if (add) {
    const em = add.querySelector("em");
    if (list.length >= CUSTOM_MAX) { add.classList.add("blocked"); em.textContent = "最多 " + CUSTOM_MAX + " 条自定义，先删一条"; }
    else { add.classList.remove("blocked"); em.textContent = "点一下填接口"; }
  }
  const sel = byId(cfg.sel);
  if (sel) {
    const head = [...sel.options].filter(option => !option.value.startsWith("custom:"));
    sel.textContent = "";
    for (const option of head) sel.append(option);
    for (const item of list) {
      const option = document.createElement("option");
      option.value = "custom:" + item.name;
      option.textContent = item.name + "（自定义）";
      sel.append(option);
    }
  }
  if (typeof syncSrcCards === "function") syncSrcCards();
}
for (const scope of ["scholar", "fact"]) {
  const cfg = KIND_CUSTOM[scope];
  const grid = byId(cfg.box)?.closest(".src-grid");
  if (!grid) continue;
  grid.addEventListener("click", (event) => {
    const more = event.target.closest(".more");
    if (!more) return;
    const card = more.closest(".src-card");
    if (!card || !card.dataset.customName) return;
    event.preventDefault();
    event.stopPropagation();
    customForm(true, card, Number(card.dataset.customIndex), scope);
  });
  byId(cfg.add).onclick = () => {
    const list = kindList(scope);
    if (list.length >= CUSTOM_MAX) {
      const add = byId(cfg.add);
      add.querySelector("em").textContent = "最多 " + CUSTOM_MAX + " 条自定义，先删一条";
      return;
    }
    customForm(true, byId(cfg.add), -1, scope);
  };
}
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
/** 每源超时：key 是来源名（自定义写 custom:名字），值是毫秒。 */
let timeouts = {};
/** 每源的二级：它没拿到结果时用谁顶上。键是来源名，值是另一家。 */
let fallbacks = {};
const STANDBY_OPTIONS = ["anysearch", "duckduckgo", "brave", "tavily", "exa"];
let kpName = "";
const kp = document.createElement("div");
kp.className = "keypop";
kp.hidden = true;
kp.innerHTML = '<div class="kp-head"><b id="kpTitle"></b><span id="kpState"></span></div>'
  + '<p class="kp-desc" id="kpDesc"></p>'
  + '<div class="kp-body"><div id="kpKeyWrap"><input id="kpInput" type="password" autocomplete="off" spellcheck="false">'
  + '<label class="kp-check"><input id="kpClearChk" type="checkbox"><span id="kpClearLabel">清除</span></label></div></div>'
  + '<div class="kp-body" id="kpTimeWrap"><label class="kp-check"><span>最多等多久（秒，留空按默认分配）</span><input id="kpTimeout" type="number" min="1" max="60" step="1"></label></div>'
  + '<div class="kp-body" id="kpStandbyWrap"><label class="kp-check"><span>这家没拿到结果时用谁顶上</span><select id="kpStandby"></select></label></div>'
  + '<div class="kp-actions"><button type="button" id="kpAdd" hidden>加入来源链</button><button type="button" id="kpTimeSave" hidden>存超时</button><button type="button" id="kpStandbySave" hidden>存二级</button><button type="button" class="primary" id="kpSave">保存</button><button type="button" id="kpCancel">取消</button></div>'
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
  const timeWrap = kp.querySelector("#kpTimeWrap");
  const timeSave = kp.querySelector("#kpTimeSave");
  if (timeWrap) timeWrap.hidden = false;
  if (timeSave) timeSave.hidden = false;
  const timeInput = kp.querySelector("#kpTimeout");
  if (timeInput) timeInput.value = timeouts[name] ? String(timeouts[name] / 1000) : "";
  const sbWrap = kp.querySelector("#kpStandbyWrap");
  const sbSel = kp.querySelector("#kpStandby");
  const sbSave = kp.querySelector("#kpStandbySave");
  if (sbWrap && sbSel) {
    sbWrap.hidden = false;
    if (sbSave) sbSave.hidden = false;
    const current = fallbacks[name] || "";
    sbSel.innerHTML = '<option value="">（不设二级）</option>'
      + STANDBY_OPTIONS.filter(item => item !== name).map(item => '<option value="' + item + '">' + item + '</option>').join("");
    sbSel.value = current && current !== name && STANDBY_OPTIONS.includes(current) ? current : "";
  }
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
  const timeWrapP = kp.querySelector("#kpTimeWrap");
  if (timeWrapP) timeWrapP.hidden = true;
  const timeSaveP = kp.querySelector("#kpTimeSave");
  if (timeSaveP) timeSaveP.hidden = true;
  const sbWrapP = kp.querySelector("#kpStandbyWrap");
  if (sbWrapP) sbWrapP.hidden = true;
  const sbSaveP = kp.querySelector("#kpStandbySave");
  if (sbSaveP) sbSaveP.hidden = true;
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
kp.querySelector("#kpTimeSave").onclick = () => {
  const name = kpName;
  if (!name) return;
  const raw = kp.querySelector("#kpTimeout").value.trim();
  if (!raw) { delete timeouts[name]; submitPage(); return; }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) { kpMsg("超时填 1 到 60 秒", true); return; }
  timeouts[name] = Math.round(seconds * 1000);
  submitPage();
};
kp.querySelector("#kpStandbySave").onclick = () => {
  const name = kpName;
  if (!name) return;
  const sel = kp.querySelector("#kpStandby");
  const value = sel ? sel.value : "";
  if (value) fallbacks[name] = value; else delete fallbacks[name];
  submitPage();
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
const TAG_REQ = {"academic.citation":["id"],"finance.calendar":["type"],"finance.fundamental":["symbol","type"],"finance.macro":["type"],"finance.news":["type"],"finance.quote":["type"],"finance.screen":["type"],"security.intel":["ioc"],"security.noise":["ip"],"security.scan":["ioc"],"security.vuln":["type","value"],"code.doc":["library"],"travel.flight":["departure","arrival","date"],"travel.flight_status":["flight_number","departure"]};
byId("tagSel").onchange = () => {
  const tag = byId("tagSel").value;
  if (!tag) return;
  byId("tagInput").value = tag;
  const req = TAG_REQ[tag] || [];
  const skel = {};
  for (const k of req) skel[k] = "";
  byId("paramsInput").value = req.length ? JSON.stringify(skel) : "";
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
  scholarCustoms = (c.scholarCustomSources || []).map(item => ({ ...item }));
  factCustoms = (c.factsCustomSources || []).map(item => ({ ...item }));
  renderKindCustoms("scholar");
  renderKindCustoms("fact");
  chain = [...c.searchProviders];
  timeouts = { ...(c.sourceTimeouts || {}) };
  fallbacks = { ...(c.providerFallbacks || {}) };
  tiers = { ...(c.providerTiers || {}) };
  weights = { ...(c.providerWeights || {}) };
  renderChain();
  for (const id of ["resultsLimit", "resultsMaxChars", "aggregateConcurrency", "concurrency", "maxTextChars", "referenceTtlSeconds", "cacheSeconds", "sourceFailThreshold", "sourceCooldownSeconds"]) byId(id).value = c[id];
  byId("structuredRead").checked = c.structuredRead === true;
  byId("anysearchZone").value = c.anysearchZone;
  byId("searchMode").value = c.searchMode === "hybrid" ? "hybrid" : c.searchMode === "aggregate" ? "aggregate" : "fallback";
  byId("timeoutSeconds").value = c.timeoutMs / 1000;
  byId("pageKiB").value = c.maxPageBytes / 1024;
  byId("imageKiB").value = c.maxImageBytes / 1024;
  for (const id of ["braveApiKey", "anysearchApiKey", "tavilyApiKey", "exaApiKey", "proxyUrl", "semanticScholarApiKey"]) byId(id).value = "";
  for (const id of ["clearBraveApiKey", "clearAnySearchApiKey", "clearTavilyApiKey", "clearExaApiKey", "clearProxy", "clearSemanticScholarApiKey"]) byId(id).checked = false;
  byId("keyState").textContent = c.hasBraveApiKey ? "已保存 Key，原值不回传页面。" : "未设置；brave 来源需要它。";
  byId("tavilyState").textContent = c.hasTavilyApiKey ? "已保存 Key，原值不回传页面。" : "未设置；tavily 来源需要它。";
  byId("exaState").textContent = c.hasExaApiKey ? "已保存 Key，原值不回传页面。" : "未设置；exa 来源需要它。";
  byId("anyState").textContent = c.hasAnySearchApiKey ? "已保存 Key，原值不回传页面。" : "未设置；不带 Key 走匿名额度。";
  byId("proxyState").textContent = c.hasProxy ? "已有代理，地址和凭据不回传页面。" : "当前直连。";
  byId("scholarEnabled").checked = Boolean(c.scholarEnabled);
  byId("scholarMailto").value = c.scholarMailto || "";
  byId("s2KeyState").textContent = c.hasSemanticScholarApiKey ? "已保存 Key，原值不回传页面。" : "未设置；Semantic Scholar 走匿名，基本每次 429。";
  restoreSourceOrder(".scholar-src", c.scholarSources || []);
  byId("factsEnabled").checked = Boolean(c.factsEnabled);
  byId("factsLang").value = c.factsLang || "zh";
  restoreSourceOrder(".fact-src", c.factsSources || []);
  syncSrcCards();
  byId("apiToken").value = "";
  byId("apiTokenClear").checked = false;
  byId("apiToken").placeholder = c.hasApiToken ? "已设置，留空则不变" : "留空 = 不开放";
  byId("save").disabled = false;
}

async function load() {
  byId("save").disabled = true;
  byId("msg").className = "";
  byId("msg").textContent = "读取中…";
  try {
    const res = await fetch("/plugins/search-engine/config", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.json();
    show(body);
    byId("msg").className = body.registrationErrors?.length ? "err" : "";
    byId("msg").textContent = (body.registrationErrors || []).map(item => item.message).join(" ");
  } catch (error) {
    byId("msg").className = "err";
    byId("msg").textContent = "读取设置失败：" + (error && error.message ? error.message : error);
  }
}

const CUSTOM_FIELDS = { cName: "name", cUrl: "url", cMethod: "method", cItems: "items", cTitle: "title", cLink: "link", cSnippet: "snippet", cKey: "key" };
let customEdit = -1;
let customScope = "web";
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
function customForm(open, anchor, index, scope) {
  const f = byId("customForm");
  byId("cMsg").textContent = "";
  byId("cMsg").className = "chain-msg";
  if (!open) { f.hidden = true; customEdit = -1; return; }
  customScope = KIND_CUSTOM[scope] ? scope : "web";
  const edit = typeof index === "number" ? index : -1;
  customEdit = edit;
  const item = edit >= 0 ? kindList(customScope)[edit] : null;
  for (const [id, key] of Object.entries(CUSTOM_FIELDS)) byId(id).value = item ? (item[key] || "") : "";
  byId("cAuthors").value = item && item.authors ? item.authors : "";
  byId("cYear").value = item && item.year ? item.year : "";
  byId("cMethod").value = item && item.method === "POST" ? "POST" : "GET";
  byId("cScholarOnly").hidden = customScope !== "scholar";
  const where = customScope === "web" ? "" : "（" + KIND_CUSTOM[customScope].label + "页）";
  byId("customTitle").textContent = (item ? "编辑来源 · " + item.name : "新自定义来源") + where;
  byId("cName").readOnly = Boolean(item);
  byId("cSave").textContent = item ? "保存修改" : "加到列表";
  byId("cDelete").hidden = !(edit >= 0);
  placeCustom(anchor);
  byId("cName").focus({ preventScroll: true });
}
function openCustomEdit(index, card) {
  if (!(index >= 0) || !customs[index]) return;
  customForm(true, card, index, "web");
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
function allCustomNames(exceptScope, exceptIndex) {
  const names = [];
  for (const scope of ["web", "scholar", "fact"]) {
    kindList(scope).forEach((item, index) => {
      if (scope === exceptScope && index === exceptIndex) return;
      names.push(item.name);
    });
  }
  return names;
}
byId("cSave").onclick = () => {
  const msg = byId("cMsg");
  const draft = {};
  for (const [id, key] of Object.entries(CUSTOM_FIELDS)) draft[key] = byId(id).value.trim();
  const scholarField = customScope === "scholar"
    ? { authors: byId("cAuthors").value.trim(), year: byId("cYear").value.trim() } : {};
  if (!CUSTOM_NAME.test(draft.name)) { msg.className = "chain-msg err"; msg.textContent = "名字只能是小写字母、数字、下划线、连字符，1–24 位"; return; }
  if (allCustomNames(customScope, customEdit).includes(draft.name)) { msg.className = "chain-msg err"; msg.textContent = "已经有同名的自定义来源（三个页签共用一个命名空间）"; return; }
  if (!/^https?:[/][/]/i.test(draft.url) || !draft.url.includes("{query}")) { msg.className = "chain-msg err"; msg.textContent = "地址要以 http(s):// 开头，并且带 {query}"; return; }
  if (!draft.items || !draft.title || !draft.link) { msg.className = "chain-msg err"; msg.textContent = "结果数组、标题字段、链接字段都要填"; return; }
  const editing = customEdit;
  const list = kindList(customScope).slice();
  const merged = { ...draft, ...scholarField };
  if (!merged.authors) delete merged.authors;
  if (!merged.year) delete merged.year;
  if (editing >= 0) list[editing] = merged;
  else list.push(merged);
  kindSet(customScope, list);
  renderKindCustoms(customScope);
  if (customScope === "web") renderChain();
  customForm(false);
  const ok = byId(customScope === "web" ? "chainMsg" : customScope === "scholar" ? "scholarMsg" : "factMsg");
  ok.className = "chain-msg ok";
  ok.textContent = (editing >= 0 ? "已改好：" : "已加进列表：") + draft.name
    + (customScope === "web" ? "，点它加进来源链" : "，勾上它才会进回退链") + "，再点右上「保存」";
};
byId("cDelete").onclick = () => {
  const scope = customScope;
  if (customEdit < 0) return;
  const list = kindList(scope).slice();
  const gone = list[customEdit] ? list[customEdit].name : "";
  list.splice(customEdit, 1);
  kindSet(scope, list);
  renderKindCustoms(scope);
  if (scope === "web") { chain = chain.filter(item => item !== "custom:" + gone); renderChain(); }
  customForm(false);
  const ok = byId(scope === "web" ? "chainMsg" : scope === "scholar" ? "scholarMsg" : "factMsg");
  ok.className = "chain-msg ok";
  ok.textContent = "已删掉自定义来源 " + gone + "，记得点右上「保存」";
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

byId("scholarProbeAll").onclick = async () => {
  const box = byId("scholarOut");
  box.hidden = false;
  box.className = "probe-out";
  box.textContent = "\u8bf7\u6c42\u4e2d\u2026";
  try {
    const res = await fetch("/plugins/search-engine/scholar-probe-all", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: byId("scholarQuery").value.trim() || undefined }) });
    const data = await res.json().catch(() => ({}));
    if (!data.sources || !data.sources.length) { box.className = "probe-out err"; box.textContent = "\u6ca1\u901a \u00b7 " + (data.detail || "\u6ca1\u6709\u6765\u6e90\u8fd4\u56de"); return; }
    box.className = "probe-out";
    box.textContent = "";
    const head = document.createElement("div"); head.className = "po-head";
    head.textContent = "\u94fe\u4e0a " + data.sources.length + " \u5bb6\u5e76\u53d1 \u00b7 \u603b\u8017\u65f6 " + data.ms + " ms";
    box.append(head);
    for (const item of data.sources) {
      const seg = document.createElement("div"); seg.className = "po-seg";
      const title = document.createElement("div"); title.className = "po-title";
      const tally = (item.returned > item.count ? "\uff0c\u8fd4\u56de " + item.returned : "")
        + (item.shared > 0 ? "\uff0c\u522b\u5bb6\u4e5f\u6709 " + item.shared : "");
      title.textContent = item.source + " \u00b7 " + item.ms + " ms \u00b7 "
        + (item.ok ? item.count + " \u6761" + tally : (item.reason || "\u6ca1\u62ff\u5230"));
      seg.append(title);
      for (const line of item.titles) {
        const one = document.createElement("div"); one.className = "po-item"; one.textContent = "\u00b7 " + line; seg.append(one);
      }
      box.append(seg);
    }
  } catch (error) {
    box.className = "probe-out err";
    box.textContent = "\u6ca1\u901a \u00b7 " + (error && error.message ? error.message : error);
  }
};
byId("factProbe").onclick = async () => {
  const msg = byId("factMsg");
  msg.className = "chain-msg";
  msg.textContent = "请求中…";
  try {
    const res = await fetch("/plugins/search-engine/fact-probe", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: byId("factSrcSel").value, lang: byId("factsLang").value, query: byId("factQuery").value.trim() || undefined }) });
    const data = await res.json().catch(() => ({}));
    msg.className = data.ok ? "chain-msg" : "chain-msg err";
    msg.textContent = data.ok ? ("通 " + data.ms + " ms · " + data.detail) : ("没通 " + data.ms + " ms · " + data.detail);
  } catch (error) {
    msg.className = "chain-msg err";
    msg.textContent = "没通 · " + (error && error.message ? error.message : error);
  }
};
byId("apiGen").onclick = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  byId("apiTokenClear").checked = false;
  byId("apiToken").value = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  byId("apiToken").focus();
};
byId("f").onsubmit = async (event) => {
  event.preventDefault();
  const config = {};
  for (const id of ["resultsLimit", "resultsMaxChars", "aggregateConcurrency", "concurrency", "maxTextChars", "referenceTtlSeconds", "cacheSeconds", "sourceFailThreshold", "sourceCooldownSeconds"]) config[id] = Number(byId(id).value);
  config.searchProviders = chain.slice();
  config.sourceTimeouts = { ...timeouts };
  config.anysearchZone = byId("anysearchZone").value;
  const modeValue = byId("searchMode").value;
  config.searchMode = modeValue === "hybrid" ? "hybrid" : modeValue === "aggregate" ? "aggregate" : "fallback";
  config.providerFallbacks = { ...fallbacks };
  config.aggregateConcurrency = Number(byId("aggregateConcurrency").value);
  const onChain = new Set(chain);
  config.providerTiers = Object.fromEntries(Object.entries(tiers).filter(([name, value]) => onChain.has(name) && value === 2));
  config.providerWeights = Object.fromEntries(Object.entries(weights).filter(([name, value]) => onChain.has(name) && value >= 1 && value <= 5));
  config.timeoutMs = Number(byId("timeoutSeconds").value) * 1000;
  config.maxPageBytes = Number(byId("pageKiB").value) * 1024;
  config.maxImageBytes = Number(byId("imageKiB").value) * 1024;
  for (const id of ["braveApiKey", "anysearchApiKey", "tavilyApiKey", "exaApiKey", "proxyUrl", "semanticScholarApiKey"]) config[id] = byId(id).value;
  for (const id of ["clearBraveApiKey", "clearAnySearchApiKey", "clearTavilyApiKey", "clearExaApiKey", "clearProxy", "clearSemanticScholarApiKey"]) config[id] = byId(id).checked;
  const plainCustom = item => ({ name: item.name, url: item.url, method: item.method,
    items: item.items, title: item.title, link: item.link, snippet: item.snippet || "", key: item.key || "" });
  config.customSources = customs.map(plainCustom);
  config.scholarCustomSources = scholarCustoms.map(item => {
    const base = plainCustom(item);
    if (item.authors) base.authors = item.authors;
    if (item.year) base.year = item.year;
    return base;
  });
  config.factsCustomSources = factCustoms.map(plainCustom);
  config.structuredRead = byId("structuredRead").checked;
  {
    const token = byId("apiToken").value.trim();
    if (byId("apiTokenClear").checked) config.apiToken = "";
    else if (token) config.apiToken = token;
  }
  config.scholarEnabled = byId("scholarEnabled").checked;
  config.scholarMailto = byId("scholarMailto").value.trim();
  config.scholarSources = [...document.querySelectorAll(".scholar-src")].filter(box => box.checked).map(box => box.value);
  config.factsEnabled = byId("factsEnabled").checked;
  config.factsLang = byId("factsLang").value;
  config.factsSources = [...document.querySelectorAll(".fact-src")].filter(box => box.checked).map(box => box.value);
  if (config.factsSources.length === 0) { byId("msg").className = "err"; byId("msg").textContent = "事实来源至少勾一个"; return; }
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
    byId("msg").className = body.registrationErrors?.length ? "err" : "";
    byId("msg").textContent = body.registrationErrors?.length
      ? "已保存配置。 " + body.registrationErrors.map(item => item.message).join(" ")
      : "已保存，设置即时生效";
  } catch (error) {
    byId("msg").className = "err";
    byId("msg").textContent = "没存上：" + (error && error.message ? error.message : error);
  } finally {
    byId("save").disabled = false;
  }
};
load();
</script></body></html>`;
