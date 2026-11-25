> **这不是上游插件。** 本目录是 `iinukami/whalelife-plugin-surf` 0.1.1 的本地修改版，
> 插件 id 为 `search-engine`（显示名「搜索引擎」），与上游 `surf` 并存、互不影响。
> 工具名对照：`surf_status → search_status`、`surf_search → search_web`、`surf_read → search_read`、
> `surf_image → search_image`、`surf_prepare_collection → search_collect`。另新增 `search_vertical`（垂直分类检索，上游没有对应工具）。改动清单见本目录 `FORK.md`。
# WhaleLife 搜索引擎

提供公开网页搜索、正文阅读、沿链接继续阅读和按需取图的插件。首版不登录网站、不点赞或评论、不执行网页脚本、不读取视频；各平台账号与专属业务留给未来平台子插件。安装本插件不会新增人格、会话、记忆系统或自主调度。

WhaleLife 交流 QQ 群：**962935021**

## 使用

- 给她一个问题或话题：`search_web` 返回候选链接，模型可按任务选择 `search_read` 阅读原页。搜索来源可配成有序列表顺序回退，默认 `anysearch → duckduckgo`，两条都不需要 API Key（AnySearch 未配 Key 时走它的匿名额度）；验证页、限流、网络不可达或页面结构变化都会明确失败，不自动改用付费服务。
- 直接给链接：`search_read` 读取公开 HTML / XHTML / 纯文字，返回来源地址、正文、链接和图片索引。搜索失败不影响读链接。正文每次最多 6000 个 UTF-16 单元，模型按 `pageRef` / `nextOffset` 继续读取；超过单页正文上限时标记 `truncated`。
- 按需看图：开启可选视觉插件后，`search_image(pageRef,imageIndex)` 获取原图并交入当前可信会话，随后由 `vision_view(mediaRef)` 交给当前主模型。图片说明不是已看图，`offered` 也不代表已理解。不会自动收藏图片。视觉不可用只关闭取图接入，文字功能保留。
- 按需收藏：开启可选图库后，AI 决定保留网页图片时调用 `search_collect(pageRef,imageIndex)`，从同一图片索引获取原图并经 `gallery.offerMedia` 取得图库引用，再调用现有 `gallery_collect({mediaRef,...})` 收藏。视觉引用与图库引用不能混用；准备引用不等于已收藏，不产生描述或向量。真正收藏仍遵守图库工具权限，是否完成以 `state:saved` 和后续任务结果为准。此功能不要求启用视觉；普通阅读和看图不向图库交入图片。
- 更多来源：`github`（仓库搜索，未登录每小时 60 次）、`huggingface`（模型库，按模型名和标签匹配，不是全文检索）免 Key；`tavily`、`exa` 要各自的 API Key。这四个走公开 JSON 接口，不解析页面，页面改版不会把它们弄坏；没填 Key 的卡片在设置页里灰着，不会排进链里假装能用。
- 垂直搜索：`search_vertical` 必带 `tag`，另可带 `params` / `zone` / `language`，只对 anysearch 来源生效，其它来源会在回执的 `notes` 里注明被忽略。详见下面「垂直搜索」一节。
- 子插件：父级声明 `console.groupChildren: true`。未来平台子插件放在 `plugins/search-engine/sub/<id>/`，声明 `depends: [search-engine]` 并使用公开服务；父停子停、子级独立启停及故障切割由宿主管理。首版没有附带 B 站、贴吧或其他平台子插件。

公开服务、结果、隐私和生命周期见 [CONTRACT.md](CONTRACT.md)。当前状态可由 `search_status` 查看；不发起额外模型请求、不改用户选定的模型。

## 设置

设置页位于主干插件管理中的“搜索引擎”。保存后即时生效（搜索来源、超时、学术开关都当场换掉），在途请求仍用发起时的设置。

| 设置 | 默认值 | 范围/说明 |
| --- | --- | --- |
| `search_scholar` | 学术检索（勾选后才有，默认不注册） |
| 搜索来源 | `anysearch → duckduckgo → bing` | 有序列表，前一个失败才换下一个；可显式加入 Brave Search API（须配 Key，可能产生费用）。首个来源拿剩余预算的 70% |
| AnySearch 区域 | `cn` | `cn` 国内 / `intl` 国际；单次搜索可用 `zone` 覆盖 |
| AnySearch Key | 空 | 留空走匿名额度；配置后走自己的额度，Key 不回传页面 |
| 代理 | 不设置，直连 | 可配置 HTTP/HTTPS CONNECT 代理；不自动读取环境代理或浏览器登录态 |
| 默认搜索结果数 | 5 | 1–10 |
| 请求超时 | 20 秒 | 1–60 秒，覆盖 DNS、连接与读取 |
| 同时请求数 | 3 | 1–8；满时明确返回 busy |
| 单页下载 | 2 MiB | 64 KiB–4 MiB，压缩前后分别受限 |
| 单图下载 | 8 MiB | 64 KiB–16 MiB；视觉自身限制仍有效 |
| 单页正文 | 60000 UTF-16 单元 | 1000–100000，分段呈现 |
| 页面引用有效期 | 600 秒 | 30–1800 秒；每会话最多 8 页、全局 32 页 |
| 结果缓存 | 300 秒 | 0–3600 秒；0 = 不缓存，见下节 |
| 连续失败阈值 | 2 次 | 1–10 次；成功一次清零，见「来源冷却」 |
| 冷却时长 | 60 秒 | 0–600 秒；0 = 不冷却 |
| 结果总量上限 | 8000 字符 | 0–40000，按序列化长度算；0 = 不限，见下节 |
| 结构化读取 | 开 | 命中 GitHub / Stack Exchange / arXiv / 维基百科时改走公开 API，失败回落页面抓取，见下节 |

API Key 与带凭据代理仅在本插件后端配置中保存，设置页只显示是否已配置。留空保留，明确勾选才清除；并发保存采用随机 revision 冲突检测。没有填写 Key 不影响默认搜索。首版不自动部署 SearXNG 等搜索服务器，也不安装或接管用户浏览器。

## 结果缓存

同样的查询、同样的来源链、同样的 limit（学术还算 yearMin，事实还算 lang），在 `cacheSeconds` 之内直接回上次拿到的那份，不再发请求。命中时回执带 `cached: true` 和 `cachedAgoMs`——这次没发请求，结果是 N 毫秒前那次拿到的，`elapsedMs` 是这次的实际耗时（通常 0–1 毫秒）。

三条边界：

- **只缓存成功且有结果的**。失败、超时、连上但零条，都不缓存，下一次照样真的去问——零条是答案，但它值不值得复用由调用方判断，不是缓存该替他决定。
- **配置一改就整表清空**。来源链、Key、代理、超时这些都在 `setConfig` 里，那一步直接 `cache.clear()`；否则改完来源链还会拿到旧链的结果。
- **进程内、有界**。最多 64 条，满了先丢最早的；过期条目在每次请求开头顺手清掉。插件重载就全没。

三个搜索工具共用这一个缓存表和方法（`cacheKey` / `cacheGet` / `cachePut`），键里带种类前缀，网页、学术、事实互不串。

## 搜索方式：顺序回退与聚合并发

`searchMode` 三档，默认 `aggregate`。

**fallback**：来源链一条有序的链，前一家失败才换下一家，拿到第一条非空结果就停。一次只付一份开销，结果只来自一家，顺序不用想。

**aggregate（默认）**：链上所有来源同时发请求，各自成段原样列出。

- 回执里 `mode: "aggregate"`，条目在 `groups[]` 里，每段带 `provider` / `sourceKind` / `elapsedMs` / `results`
- **顶层 `results` 为空**。同一批内容如果既在 `groups` 又在 `results` 里出现，等于花两倍 token 读一遍
- **不排序、不合并**。三家谁更相关我们判不了；按「几家都给了它」排出来的顺序只是看着像评测。要合并去重得先有一套能吃的权重
- 只标重复：同一条链接（去掉 `#` 锚点后相同）被后面的来源再次给出时，那条带 `dupOf: "先给出的那家"`，顶层给 `overlap`，数值是被两家以上覆盖的 URL 数。`overlap` 高说明聚合在花钱买同一份东西
- 一家的失败不拖累别家，`error: { code, reason }` 留在它自己那段上；全都没结果才报 `search_exhausted`
- 冷却中的来源直接写 `skipped`，不发请求
- 总量预算按 `groups` 顺序分配（先到先得），每段被丢的条数记在那段的 `truncated` 上

实测（同一查询，链 `anysearch → duckduckgo → bing`，limit 5）：

```
fallback    provider=anysearch   elapsedMs=2167   5 条
aggregate   elapsedMs=2007   groups 三家
            anysearch   2006ms  5 条
            duckduckgo   676ms  5 条（其中 2 条 dupOf=anysearch）
            bing         692ms  0 条
            overlap=2
```

两件事从这组数里读得出来：

一是**并发不涨等待**。聚合总耗时 2007ms，跟单用 anysearch 的 2167ms 一样——等于最慢那家，不是三家相加。

二是**聚合能暴露「某一家空手而归」**。bing 那次返回零条，单用 bing 你会以为是没搜到，聚合时一眼看出另外两家有结果。这也是它唯一比回退强的地方：一家漏了，另一家能补上。

代价说清：三家各付一份请求，结果条目也三份进上下文；`overlap` 高的时候，多花的那部分没换来新信息。

**hybrid**：请求方式和 aggregate 一样（几路同时发），区别只在「谁代表这次搜索」。链上顺序就是主次顺序，第一个拿到结果的当主，回执里给 `primary`；排在它前面的那几家失败或零条时，主位按链顺序顺延，前面几家为什么没顶上记进 `primaryFallback`。顺延**不额外发请求**——结果本来就在手上，变的只是名分。

页面「来源」页有「搜索方式」下拉，改完即时生效。缓存键带模式前缀，切换模式不会拿到另一种模式的结果。

## 结果总量上限

`search_web` 一次最多 10 条，每条摘要由来源给定，常见几百字，长的一千多字。10 条一千字就是一万字直接进上下文，而且之后每一轮都要重发——工具结果进了历史就不再缩小。

`resultsMaxChars`（默认 8000，0 表示不限）管这件事，按 `JSON.stringify` 之后的长度算，不是字数：

- 按原顺序累加，装得下的整条保留
- 第一条装不下的位置：先试把它的摘要截短（切点落在代理对中间会退一格），末尾补省略号
- 截完还放不下、或者后面的条目，全部丢掉，回执里多一个 `truncated: N` 表示丢了几条
- **至少保留一条**。预算小到连一条骨架都装不下时，保留第一条、摘要截到剩下多少算多少，不会因此变成「零条结果」——那会被上层当成来源空手而归，误导成搜不到东西

实测：十条各一千字摘要、预算 8000 → 保留 8 条，末条摘要切到 487 字，总量 7992。恢复默认后同样的查询 8 条全留、不带 `truncated`。

只作用于 `search_web`。学术和事实返回的是结构化条目（摘要通常短），暂未套这一层。

## 来源元数据

每条结果除了标题、链接、摘要，还带两个字段：

- `via`：这条是怎么来的。`api` = 对方公开 JSON 接口（anysearch / brave / tavily / exa / github / huggingface）；`html` = 解析对方搜索页面（duckduckgo / bing）；`custom` = 自定义来源，字段映射由使用者自己填
- `domain`：链接的主机名，去掉 `www.`；URL 解析不出来时这个字段不出现，不编一个

顶层另有 `sourceKind`，就是这一家用的是哪一类。

为什么加：原先只知道「这条来自哪家」，不知道「这条有多可信」。`html` 那类是照对方页面结构抓的，对方改一次版就变形——可能是抓空，也可能是把页面别处的字当成摘要。分了类，才知道一条摘要读着不对劲该怀疑谁。

`domain` 用来对号：条目自称是哪个机构，域名是不是那个机构。

实测两次真搜索：

```
anysearch   sourceKind=api   via=api    domain=github.com / space.langbot.app / blog.csdn.net
duckduckgo  sourceKind=html  via=html   domain=handbook.modular.com / learn.microsoft.com
```

只作用于 `search_web`。学术和事实的条目本来就有 `source` 字段说明来自哪一家。

## 二级来源

每家来源可以配一个自己的二级：它没拿到结果时改用那一家。键是来源名，值是另一家：

```json
"providerFallbacks": { "anysearch": "exa", "tavily": "duckduckgo" }
```

「没拿到结果」包含两种：请求失败（超时、被拒、解析不出），以及连上但零条。零条也算，是因为在聚合里那一段就是空的，读者从空段分不出「这家没这内容」还是「这家坏了」。

只有一层——顶上的那家不再触发它自己的二级，免得两家互指绕成环；配置里也不许自指，`{"anysearch": "anysearch"}` 直接 400。

二级如果本来就在来源链上，就不再重打一遍：它已经并发出去了，回执的 `notes` 里会写明「不重打，看它那一段」。

那一段回执长这样：

```
custom:dead   1400ms   results: [... 3 条]      ← 这是二级 exa 给的
              error:   { code: "unsafe_url", reason: "只允许访问公开 HTTP(S) 地址。" }
              standby: { provider: "exa", elapsedMs: 1397, reason: "只允许访问公开 HTTP(S) 地址。" }
```

`error` 记原来那家为什么没顶上，`standby` 记谁顶的、花了多久。二级自己也挂时，`standby.error` 再记一层；两家全挂才报 `search_exhausted`，错误正文里两家原因都在。

页面上：来源链每张卡的「⋯」弹层里有一栏「这家没拿到结果时用谁顶上」，选完点「存二级」。

实测（链 `custom:dead → duckduckgo`，`custom:dead` 指向内网必被拦，二级设成 exa）：那一段照旧标 `unsafe_url`，`results` 是 exa 的 3 条，总耗时 1400ms —— 并发下等于二级那一路的耗时，没有叠加。

## 来源冷却

一个来源超时之后，下一次查询又会把同样的预算花在它身上——如果它正处在半死状态（对端限流、DNS 抽风、连接卡在建连），就是拿预算反复撞同一堵墙。

`sourceFailThreshold`（默认 2）和 `sourceCooldownSeconds`（默认 60，0 = 关）管这件事：同一个来源**连续**失败到阈值，就进冷却；冷却期内它在回退链里被跳过，回执里记一条 `code: "source_cooling"`，写明还剩几秒。成功一次立刻把计数清零，所以只有连着失败才算数。

四条边界：

- **只算真失败**。超时、HTTP 错误、解析失败记账；「连上但零条」是应答，不记账——把空结果当故障，等于把一个能用的来源关进冷却。
- **全部都在冷却时会硬打一遍**。宁可慢一次，也不让搜索空手回去。这时候回执里不会出现 `source_cooling`。
- **三个搜索工具共用一张健康表**（`sourceFailThreshold` 只管计数，按来源名索引：网页、学术、事实各自的名字不同，天然分得开）。
- **配置一改就整表清空**，跟缓存一样在 `setConfig` 里 `health.clear()`——改了来源链还按旧名字的账本判，会莫名其妙跳过。

实测（`tests/source-health.test.ts`，7 条）：连续两次 500 之后第三次不再请求它、推进 61 秒自动恢复、中间成功一次会清零、零条不记账、`0` 关掉冷却、全冷却时两个来源都硬打、学术共用同一套规则。变异验证：阈值改成 999 / 冷却块去掉 `continue` / `forceAll` 恒真，三种各冒 FAIL——测试不是空转。
## 垂直搜索（AnySearch）

`search_vertical` 是独立工具：`tag` 必填，另有 `params`、`zone`、`language`；`search_web` 只留 `query` 和 `limit`，想按分类检索就换工具，不必记一串可选参数。只有来源链里的 anysearch 会用这些参数；其它来源忽略，并在回执 `notes` 里写明。设置页「搜索」那页有「垂直搜索试一下」，可以直接拿真实来源验一组 tag，不改配置。

AnySearch 的 tag 不是自由词。实测裸词（`academic`、`news`、`security`）一律被拒成 `Invalid tag`，多数 tag 还要配 `params`：

| tag | 需要的 params | 实测 |
| --- | --- | --- |
| `finance.quote` | `{ "type": "stock" }` | 200 |
| `security.vuln` | `{ "type": "cve", "value": "CVE-2024-3094" }` | 200，返回 osv.dev 的 CVE 页 |

`params` 的键值都必须是字符串、最多 8 个，会原样放进请求体的 `params` 对象。缺参数时来源返回 4xx，它的原话（例如 `Missing required params for tag 'security.vuln': type, value.`）会带进错误文案，能直接看出是参数问题而不是网络问题。

## 学术搜索（默认不注册）

`search_scholar` 是另一个工具，**默认不在工具表里**。要它，去设置页「学术」页签勾上「启用 search_scholar」并保存——保存那一刻它就被注册；取消勾选就注销；都不用重载插件。

这样做是为了让不用它的人不付每轮的 schema。勾上之后每轮多一份工具定义，这是真的开销。

四个来源都是公开接口，不要 Key：

| 来源 | 接口 | 特点 |
|---|---|---|
| arXiv | `export.arxiv.org/api/query` | 预印本，全文免费，只有 Atom XML |
| OpenAlex | `api.openalex.org/works` | 覆盖面最广，带被引数；摘要存倒排索引，要按位置拼回去 |
| Crossref | `api.crossref.org/works` | 期刊注册库，DOI 最全；**不加类型过滤时图注会占满前排** |
| Semantic Scholar | `api.semanticscholar.org/graph/v1` | 无 Key 时常 429，回退链会继续下一个 |

回退规则和网页搜索一样：前一个连不上才换下一个，第一个拿剩余预算的七成；连上但零条算应答，记进回退链再试。全部失败才报 `search_exhausted`。

返回的是结构化条目，不是网页摘要：标题、作者（最多 6 个）、年份、期刊、DOI 链接、被引数、摘要前 500 字。`yearMin` 可只要某年之后的文献，被过滤掉的条数写进 `notes`。

Crossref 和 OpenAlex 支持 `mailto`（设置页「联系邮箱」），填了才进 polite pool；不填照常请求，只是配额低一点，不会因此拒绝。

实测（2026-11-25）：arXiv 87–928 ms 3 条；OpenAlex 921–1430 ms 3 条；Crossref 959–3555 ms 3 条；Semantic Scholar 连续 429。
## 多源回退的来源

顺序回退、时间预算分配、空结果分层这三条，移植自 [Lain-in-coding/dsh-grok-search](https://github.com/Lain-in-coding/dsh-grok-search)（MIT）。那是 DeepSeek Harness 的插件，用来绕开它家官方付费搜索；本插件只取调度思路，运行时代码按自己的结构重写，不含它的 Rust 内核，也不引入它那五家 Key 依赖。

与首版不同的两点：

- 首个来源拿剩余预算的 70%，其后按剩余来源数均分，避免最容易成的那个被平均分配掐掉
- 连上了但零条，记进回退链继续试下一个；全部试完仍无结果时报 `search_empty`（有来源应答过），而不是 `search_exhausted`（全都失败）

这条只是标注思路来源，不改变本项目许可；第三方运行依赖见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 自定义来源

三处都能加：搜索来源（网页）、学术来源、事实来源。三个列表共用一个命名空间——`custom:名字` 出现在哪条链上必须没有歧义，重名会被拒。

字段结构一样：地址里写 `{query}`，给出结果数组的点路径和标题、链接字段，摘要可留空。只收 http/https、不跟随跳转（查询串不会被重发到另一个域），只吃 JSON、不解析别人的 HTML。学术那份多两个可选字段：作者、年份（作者认字符串、字符串数组、`{name}` / `{display_name}` 对象数组）。

来源返回 200 但结构对不上时，回执里会带上它自己给出的原因——例如 MediaWiki 的 `Unauthorized API call`，而不是只丢一句"认不出"。

设置页「来源」页最下面有一张「+ 自定义来源」，填一个返回 JSON 的搜索接口就能加进链，规则如下：

- **地址**必须以 `http(s)://` 开头并带 `{query}` 占位，其余部分原样保留；不跟随跳转，查询串不会被重发到另一个域
- **只吃 JSON**，按点路径取字段（`data.results`），不支持数组下标；根就是数组的话填 `$`
- **GET 或 POST**；POST 会发 `{query, limit}` 的 JSON 体
- **Key 可选**，放在 `Authorization: Bearer`。存盘后不回传页面，同名留空表示沿用原值
- 名字只收小写字母、数字、`_`、`-`，1–24 位；自定义来源在配置里存成 `custom:<名字>`，和内置名字不会撞
- 最多 8 条自定义、链上最多 6 个来源

「探一下」会拿你填的地址真打一次，把数组位置和标题/链接/摘要字段猜出来填进表单——猜错也能手改。实测：GitHub 公开接口探出 `items` / `full_name` / `html_url` / `description`。

需要 Key 的预设卡片（brave / tavily / exa）点一下会滚到下面那一栏的 Key 输入框，填完保存卡片就亮。

未验证：真浏览器里拖动排序、卡片高亮、探完自动回填这几步的观感；只验到接口和页面 HTML。

## 结构化读取

`search_read` 碰到这几类地址时不再解析页面壳，改打它们的公开 API：

| 地址 | 走哪条接口 | 拿到什么 |
| --- | --- | --- |
| `github.com/{owner}/{repo}/issues/{n}`、`/pull/{n}` | `api.github.com/repos/{owner}/{repo}/issues/{n}` | 标题、状态、标签、作者、正文（Markdown 原文）、前 30 条评论 |
| `github.com/{owner}/{repo}/releases/tag/{tag}` | 同一个库的 `/releases/tags/{tag}` | 版本名、发布说明、预发布标记 |
| `stackoverflow.com`、`superuser.com`、`*.stackexchange.com` 的 `/questions/{n}` | `api.stackexchange.com/2.3/questions/{n}` | 票数、浏览、提问者、正文；回答按票数排序，已采纳的排最前 |
| `arxiv.org/abs/{id}`（`/pdf/{id}` 也行） | `export.arxiv.org/api/query?id_list=` | 作者、提交日期、备注、摘要 |
| `xx.wikipedia.org/wiki/{标题}` | `/w/api.php?action=query&prop=extracts` | 纯文本正文 |

都不需要 Key。好处是干净：GitHub issue 不再混进导航栏和评论区的壳，Stack Exchange 的回答按票数而不是页面默认顺序，维基条目不用跟脚注和图片说明挤在一起。

**失败一律回落**：接口报错、条目不存在、返回结构对不上，都会退回普通页面抓取，回执的 `notice` 里写明原因（例如「结构化读取（GitHub issue）没成，回落到页面抓取：http_error。」），不静默换路径。

**两处外部脾气**：Stack Exchange 的部分问题详情会被换成不带正文的版本（答案通常还在），回执里会直说；GitHub 不带 Key 每小时 60 次，超了报 403 并回落成页面抓取。

设置页「读取」里可以整个关掉（`structuredRead`），关掉就只走页面抓取。

## 内容与能力边界

网页和搜索结果是外部数据，不能改变权限或成为系统指令。网络只允许公开 HTTP(S) 地址，每次跳转重新校验 DNS 并固定已验证 IP，拒绝内网、环回、链接本地及凭据 URL。图片也经过同一访问限制。本站账号 Cookies 不在父插件中维护，遇到登录或验证要求会报告受限，不绕过限制。

首版直接解析服务器返回的正文；纯前端渲染、需要点击展开或需要登录的内容可能不可读。PDF、原生视频、音频、SVG 图片不在首版支持范围。搜索页面不是承诺稳定的官方 API，不能把隔离回归称为真实搜索长期可用。

临时页面只放内存，不写文件、日志或长期记忆。所有内容工具使用主干 `registerTransient`；持久回执只放动作、状态和固定错误码。普通聊天最终回复按主干现行规则正常保存，技术 `runTransient` 执行仍遵循主干隔离契约。图片交入后由提供方自己的 TTL/释放规则管理；同一页同一图片的已完成请求在引用有效且对应提供方实例不变时复用。取消或停用尝试限时释放已确认的视觉媒体；宿主已撤销服务时不能保证立即释放，最终由视觉 TTL 回收。图库公开服务没有释放临时引用接口，未收藏图片按图库现行 24 小时 TTL 管理，surf 不读取或删除图库私有数据。

## 开发与发行

使用 Node.js 24.22.1 或更新版本；宿主源码与本仓库同级，路径为 `../whalelife`。宿主仅供公开类型和隔离兼容测试，生产插件不导入主干内部实现。

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
```

发行目录 `dist/search-engine/` 包含发行白名单、运行依赖、许可证及 BUILD.json 摘要。安装位置为宿主 `plugins/search-engine/`；升级只同步发行文件并保留 data。源码仓库及发行目录不代表已安装或正式进程已加载。

测试使用合成网页、图片、模拟搜索/视觉/图库及项目内 `.artifacts/tests/` 临时宿主，不调用付费模型或正式账号。宿主回归保留基线 `bfc7639e69358f2d981faf8a4554656d0dc70b12` 和冻结兼容标签 `refs/tags/213b52b`，图库接入另覆盖 2026-11-09 主干 `38af5e72e466dd6da7f390e445cd1e6cc2f02a69`。冻结旧宿主缺少临时工具时，只保留状态、设置和明确的 `host_required` 结果，不注册会泄露内容的普通替代工具。最低完整功能要求公开 `registerTransient`；可选识图还要求 `ctx.optional`、`registerMultimodal` 和视觉服务，可选收藏准备要求 `ctx.optional` 与图库服务，不凭 API 1.0.0 推断这些新增方法存在。

开发会话负责验证和本地提交；远端 push、标签与 Release 由统一发布会话处理。
