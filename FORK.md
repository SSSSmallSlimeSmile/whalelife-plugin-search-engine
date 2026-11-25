# FORK：搜索引擎（search-engine）

上游：`iinukami/whalelife-plugin-surf` 0.1.1，AGPL-3.0-only。
本仓库是它的**本地修改版**，插件 id 改为 `search-engine`，显示名「搜索引擎」。
它不是上游的官方版本，原作者不对它背书。

## 为什么另起一个 id

上游 id `surf` 已经在这台机器上跑着，且它的子插件 `bilibili` 声明 `depends: [surf]`。
直接改名会让两套的东西互相顶掉；另起 id 可以并存，也不动上游那份。

## 与上游的差别

1. **id / 工具名 / 路由改名**：`/plugins/surf/*` → `/plugins/search-engine/*`，服务名 `surf` → `search-engine`。
2. **多源顺序回退**：`searchProviders` 是有序列表，前一个失败才换下一个。
3. **预算不再均分**：第一个来源拿剩余预算的 70%，其余按剩余来源数均分（上游是均分，三个源时首个只拿 1/3）。
4. **零结果算应答**：连上但零条 → 记入回退链继续试；只有全都没接上才判「全挂」。上游把零条当失败。
5. **回执带来源与耗时**：结果附带 `provider / elapsedMs / fallback`（有回退才写）。
6. **`search_read` 带未读范围**：`remainingChars` 表示此次片段之后还剩多少正文。
7. **AnySearch 垂直搜索**：新增来源 `anysearch`（POST JSON），`search_web` 支持 `tag` / `params` / `zone` / `language`。
   这一路的参数形状取自本机旧的 AnySearch 插件（`plugins/search`），不是上游 surf 有的东西。
8. **POST 支持**：网络层原来只有 GET；现在允许 POST，但正文不跟随跳转（避免把查询和凭据发到新地址），
   非 2xx 时保留最多 4 KiB 响应体，用来把来源自己说的原因（如缺哪个参数）带进错误文案。
9. **设置页重做**：改用宿主 `/ui/styles.css` 的通用面板结构，页签为「来源 / 学术 / 事实 / 搜索 / 读取」；每张来源卡自带悬浮窗（Key、单源超时、回退来源），可拖动排序、可跨一级/二级拖动。
10. **聚合模式（默认）**：并发打前 `aggregateConcurrency` 家，每家在 `groups` 里自成一段，跨来源按 URL 去重并标 `dupOf`，顶层给 `overlap`；每段带 `returned / shown / shared / viaMix`。`searchMode` 可切回 `fallback`。
11. **两级来源与权重**：`providerTiers`（一级可设回退、二级不设）+ `providerWeights`（1–5），`resultsMaxChars` 与条数按权重分配，而不是各家均分。
12. **预算与健康**：`sourceTimeouts` 单源上限、`cacheSeconds` 结果缓存（只缓存成功）、`sourceFailThreshold` / `sourceCooldownSeconds` 来源冷却（没轮到的来源不计失败、零条算应答清账）。
13. **结果集翻页**：回执带 `setId / shown / available / hasMore`，传 `more` 取下一批，不发请求、不重复给。
14. **学术与事实检索**：`search_scholar`（arXiv / OpenAlex / Crossref / Semantic Scholar / Europe PMC）、`search_facts`（维基百科 / 维基数据 / OpenLibrary / OEIS），运行时注册——勾选后才进工具表。
15. **结构化读取**：GitHub issue/PR/release、Stack Exchange（按票排、已采纳置顶）、arXiv、维基百科改走各自公开 API，失败回落页面抓取。
16. **来源削减**：移除 `bing`（解析早已失效、恒零条）与 `github` / `huggingface`（它们查的不是网页）；未知来源名一律拒绝，不再静默落到 duckduckgo。


其中 2–6 的调度思路参考自 `Lain-in-coding/dsh-grok-search`（MIT），代码按本插件结构重写，
不含它的 Rust 内核，也不引入它那几家 Key。

## 共享目录的边界

`node_modules`、`vendor/licenses`、`LICENSE*`、`NOTICE.md`、`THIRD_PARTY_NOTICES.md` 原样保留，
署名与许可未改。替换的只有插件标识与行为差异部分。
