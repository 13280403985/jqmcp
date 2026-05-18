# 久谦「通用搜索」抓包说明（定契约）

本文档用于在无法公开久谦内部接口文档时，由**已授权账号**在浏览器中完成一次可复现的抓包，并把结果填入项目根目录的 `meritco.http.json`（可从 [config/meritco.http.example.json](../config/meritco.http.example.json) 复制）。

**路由说明：** 页面 bot 的「通用查询」在浏览器里常见 **实时通道（如 WS）+ 页面渲染**；**MCP 通用查询**已固定为 **`meritco_universal_search` → Playwright**（`meritco.playwright.json`），不再维护直连 WS 的 CLI/配置。`smartWords/get` 仅适用于「辅助搜索」等 HTTP 场景。

**会话历史 HTTP：** `POST /meritco-chatgpt/history/get` 的请求体须从 DevTools **Payload** 原样抄入 `meritco.http.json` 的 `createTask.body`。常见形态为 **`conversationId`（数字）** 与 **`category`**（如 `"DEEP_RESEARCH_SM"`）；可用占位符 `{{conversationId}}`、`{{category}}`，并在配置里加 **`createTask.bodyNumericFields": ["conversationId"]`** 以便发出 JSON 数字而非字符串。仍支持分页类 `{{page}}` / `{{pageSize}}` / `{{query}}` 等字段，以你抓包为准。响应里列表节点多为 `result`；配置 **`extractBody.asJson: true`** 可把该对象格式化为文本返回给 MCP。

**Playwright 正文选择器（bot 页）：** 结果区外层为 `div.flex-content.mask-bottom`，其**直接子节点**中，紧挨顶部工具条（「多轮对话」「查看详情」等）的 **`div.main-wrapper`** 即为报告外层容器。配置 **`bodySelector`: `.flex-content.mask-bottom > .main-wrapper`**。若返回里仍混入工具条文案，在 **红框内**对「只含报告列表/段落」的根节点「复制 selector」，填入 **`extractSelector`**（相对 `main-wrapper` 内部的子选择器），工具将只对该节点做稳定等待与 `innerText`，效果接近你圈选的红色区域。

**输入框超时：** 在 `meritco.playwright.json` 中配置 **`searchInputSelectors`** 数组（多段 CSS，自上而下尝试）；仍失败时可设环境变量 **`MERITCO_PLAYWRIGHT_HEADLESS=0`** 弹出浏览器对照 DevTools 更新选择器，并确认未跳登录页。

**其它常用项（见 `meritco.playwright.json`）：** `waitUntil: "load"` 比 `domcontentloaded` 更利于脚本/样式就绪；`dismissAuxiliaryText: "跳过"` 在出现「辅助搜索」层时自动点击（无则忽略）；`minStableTextLength` 控制「正文至少多长才开始判定稳定」；`headless` 字段已由通用查询忽略（默认后台无头，见 `MERITCO_PLAYWRIGHT_HEADLESS`）；`afterSubmitPauseMs` 为提交后等待再点「跳过」的间隔。

## 1. 准备工作

- 使用 Chrome 或 Edge，登录 [久谦中台](https://research.meritco-group.com/login?redirect=%2Freport%2Fmec)。
- 打开开发者工具（F12）→ **Network**，勾选 **Preserve log**。
- 过滤器选 **Fetch/XHR**（若有 WebSocket/SSE，再额外关注 **WS** / **EventStream**）。

## 2. 需要记录的最小信息

对「发起一次通用搜索 → 等到生成结束」过程中的每一个关键请求，记录：

| 字段 | 说明 |
|------|------|
| URL | 完整地址；若带路径参数（如任务 id），标出哪一段是变量 |
| Method | GET / POST / PUT |
| Request headers | 除 `Cookie` 外，是否必须带 `Authorization`、`Referer`、`Content-Type`、`x-*` 等 |
| Request body | JSON 形态；哪个字段对应用户输入的「搜索词」 |
| Response body | 哪一字段是 **任务 id**；哪一字段表示 **状态**（进行中/完成）；哪一字段是 **最终正文** |

## 3. 「生成完成」如何判定

在配置文件中用 `poll.completedWhen` 描述（见示例）。常见形态包括：

- 轮询同一接口，响应里 `status`（或类似字段）从 `pending`/`generating` 变为 `done`/`success`。
- SSE：最后一个 `event` 或某字段标记结束。
- WebSocket：服务端推送 `type: complete` 等（若你自建 HTTP 契约复刻其它通道，按实际帧字段填写）。

**请把实际枚举值写进配置**，不要用猜测值。

## 4. 正文字段

- 若 `smartWords/get` 等接口返回的是 **「辅助搜索」联想结构**（`type` + `words` 列表，与页面弹层一致）：将 `extractBody.path` 指向该数组（常为 `result`），并设 **`extractBody.auxiliaryAsResult`: `true`**，工具会输出格式化文本而非轮询长文。
- 若正文为 **Markdown/HTML 字符串**：将 `extractBody.path` 指向该字符串字段即可（此时 `auxiliaryAsResult` 应为 `false`）。
- 若正文为 **多块拼接**：记录拼接规则，或暂时在配置里指向「最终合并后的字段」。

## 5. 导出 HAR（可选）

在 Network 面板右键 → **Save all as HAR with content**，便于自己留档；**勿将含 Cookie 的 HAR 提交到 git**。

## 6. 抓包结果如何对应到 `meritco.http.json`

示例文件里的 URL **只是占位**，必须换成你在 Network 里看到的真实路径。

| 你在 Network 里看到的 | 填到配置里的位置 |
|----------------------|------------------|
| 第一次点「搜索/生成」发出的请求 URL（去掉域名） | `createTask.path`；若查询词在 URL 里，写成 `...?keyword={{query}}` |
| 该请求的方法 | `createTask.method` |
| 请求体 JSON 里「用户输入」所在字段 | 在 `createTask.body` 里用 `{{query}}` 占位（结构要与抓包一致） |
| **首包**响应里任务 id / 会话 id 所在位置 | `createTask.responseTaskIdPath`（点号路径，如 `data.id`、`result.taskId`） |
| 之后**反复出现**直到结束的那条请求（通常带同一个 id） | `poll.pathTemplate`，把变化段改成 `{{taskId}}` |
| 轮询响应里表示「已完成」的字段与取值 | `poll.completedWhen.path` + `equals` **或** `in`（多值任选其一即完成） |
| 完成后正文所在字段 | `extractBody.path` |

**常见「对不上」原因：**

1. **根本没有第二条轮询 URL**：若首包响应里已经是完整正文，设 `"afterCreate": "extract"`，并**删除整个 `poll` 块**；可选在 `createTask` 里加 `completedWhen` 校验状态。  
2. **首包 `result` 为 `[]` 且 JSON 里没有任何会话 id**（仅有 `code/innerCode/message/result` 等）：在 **`poll`** 里设 **`sameAsCreate`: `true`** 且 **`untilBodyReady`: `true`**，会**重复发送与 createTask 相同的请求**（靠 Cookie/Session），直到 `result` 能解析出正文（见根目录 `meritco.http.json`）。若有 id 可轮询，则不要用 `sameAsCreate`，改配 **`responseTaskIdPath`** 与普通 **`poll.body`**。  
3. **任务 id 不在 `data.taskId`**：在响应 JSON 里逐级展开，把真实路径写进 `responseTaskIdPath`。  
4. **完成态不是字符串 `done`**：看接口实际枚举（如 `2`、`SUCCESS`），用 `equals` 或 `in: ["done","SUCCESS"]`；若只有「正文是否已生成」可判，优先用 **`poll.untilBodyReady`**。  
5. **请求头缺项**：把抓包里除 `Cookie` 外必填的头（如 `Referer`）写进 `defaultHeaders`（勿把 Cookie 写进 JSON，只用环境变量）。

## 7. 填入 MCP 配置

复制 `config/meritco.http.example.json` 为项目根目录 `meritco.http.json`，按上表修改。

环境变量 `MERITCO_COOKIE` 中存放浏览器 **Request Headers** 里整段 `Cookie` 的值（或等价格式），并定期轮换。
