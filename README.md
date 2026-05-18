# jqmcp — 久谦通用搜索 MCP

在 Cursor 等 MCP 客户端中可调用：

- **`meritco_universal_search`**：**仅 Playwright**：无头/有头打开 bot 页并抽取正文（`meritco.playwright.json`）。
- **`meritco_history_get`**：始终走 HTTP（如 `history/get`），**不受** `MERITCO_MODE` 影响，用于拉会话/列表 JSON。

## 暴露给他人（远程 HTTP MCP）

若需把 **通用查询** 以 MCP 协议供他人远程连接（Railway / Render 等），使用 **`mcp-server/`** 目录：

```text
mcp-server/
├── server.py           # FastMCP，HTTP 默认 http://0.0.0.0:8000/mcp/
├── requirements.txt
├── Procfile            # web: python server.py
└── README.md           # 部署与连接说明
```

```bash
# 仓库根目录先构建 Node 后端
npm install && npm run build && npx playwright install chromium

cd mcp-server
pip install -r requirements.txt
python server.py
```

详见 [mcp-server/README.md](mcp-server/README.md)。

## 前置条件

- Node.js 18+
- 浏览器里登录久谦后复制请求头中的 **整段 `Cookie`** → 环境变量 `MERITCO_COOKIE`；若接口还要求 **`Token` 请求头**（与 Cookie 里的值不同），再设 **`MERITCO_TOKEN`**（勿提交到 git）。
- **更省事（推荐）：** `npm run build` 后执行 **`npm run meritco:profile`**，在弹出的 Chromium 里登录一次；在 `meritco.local.env` 设 **`MERITCO_USE_PERSIST_PROFILE=1`**，通用查询会复用目录 **`meritco-chromium-profile/`** 里的会话，一般**不必再维护** Cookie/Token（`meritco_history_get` 等仍走 HTTP 的接口若需要 Cookie 请照旧配置）。
- 通用查询依赖 **`meritco.playwright.json`** + Cookie / **`MERITCO_STORAGE_STATE`** 或持久化 profile。可选 **`meritco.http.json`**（供 `meritco_history_get` 等 HTTP 工具）。

## 安装与构建

```bash
cd JQMCP
npm install
npm run build
```

若使用 Playwright 模式，本机需安装 Chromium（一次性）：

```bash
npx playwright install chromium
```

## 配置文件

| 文件 | 说明 |
|------|------|
| `meritco.http.json` | 默认同 **`/meritco-chatgpt/history/get`**，请求体支持 **`{{page}}` / `{{pageSize}}` / `{{query}}`**；**`extractBody.asJson: true`** 时把 `result` 格式化为 JSON 文本。若仍要用 `smartWords/get` 联想，参见 [config/meritco.http.example.json](config/meritco.http.example.json)；history 模板见 [config/meritco.http.history.example.json](config/meritco.http.history.example.json) |
| `meritco.playwright.json` | 从 [config/meritco.playwright.example.json](config/meritco.playwright.example.json) 复制；**`extractSelector`** 可选，用于只抽取红框内报告正文（相对 `bodySelector` 的子选择器） |

环境变量：

| 变量 | 说明 |
|------|------|
| `MERITCO_USE_PERSIST_PROFILE` | 设为 `1`：Playwright 使用持久化 Chromium 用户目录（默认 `{MERITCO_CONFIG_DIR}/meritco-chromium-profile`），需先 **`npm run meritco:profile`** 登录一次 |
| `MERITCO_PLAYWRIGHT_HEADLESS` | 可选：`1` 显式无头；**不设时通用查询默认无头（后台，不弹窗）**。`0` 为有头窗口（仅建议本机终端对照页面调试；Cursor MCP 无桌面时可能崩溃） |
| `MERITCO_PLAYWRIGHT_DISABLE_GPU` | 可选：设为 `1` 时 Chromium 增加 `--disable-gpu`，部分环境可减少闪退 |
| `MERITCO_CHROMIUM_USER_DATA` | 可选：自定义持久化目录绝对/相对路径（设置后即使不设 USE_PERSIST 也会用该目录） |
| `MERITCO_PERSIST_MERGE_AUTH_LOCALSTORAGE` | 可选：设为 `1` 时在持久化模式下仍用 `meritco-auth.json` **整包覆盖** localStorage；默认**不**覆盖，以免旧 token 冲掉 profile 里刚登录的会话 |
| `MERITCO_COOKIE` | 非持久化模式时必填（或 `MERITCO_STORAGE_STATE` / `MERITCO_COOKIE_FILE`） |
| `MERITCO_TOKEN` | 与浏览器 Network 一致：请求头键名为 **`Token`**（大小写一致），值为抓包里的那一串 |
| `MERITCO_MODE` | 可选：`http` \| `playwright`。未设置时：**若存在 `meritco.playwright.json` 则默认 `playwright`**，否则 `http`。拉会话仍可用 **`meritco_history_get`** |
| `MERITCO_CONFIG_DIR` | 可选：配置文件所在目录，默认当前工作目录 |
| `MERITCO_HTTP_CONFIG` | 可选：`meritco.http.json` 的绝对路径 |
| `MERITCO_PLAYWRIGHT_CONFIG` | 可选：`meritco.playwright.json` 的绝对路径 |
| `MERITCO_VERBOSE` | 可选：设为 `1` 时轮询会在 **stderr** 打印进度（终端里看起来像「卡住」时用来确认仍在跑） |
| `MERITCO_CONVERSATION_ID` | 可选：HTTP 请求体 `{{conversationId}}`（与 MCP 参数二选一）；本地 `npm run query` 也可直接传纯数字当 query |
| `MERITCO_CATEGORY` | 可选：覆盖默认的 `DEEP_RESEARCH_SM`（`{{category}}`） |
| `MERITCO_COOKIE_FILE` | 可选：**仅一行** Cookie 文本文件路径（UTF-8），避免 PowerShell 对超长 `$env:MERITCO_COOKIE` 截断；与 `MERITCO_COOKIE` 二选一 |
| `MERITCO_STORAGE_STATE` | 可选：Playwright **`storageState` JSON** 绝对/相对路径（推荐）。生成示例：`npx playwright codegen https://research.meritco-group.com/report/custom/bot --save-storage=meritco-auth.json`，在弹出窗口登录后关闭即可 |
| `MERITCO_GATEWAY_*` | 可选：见下文「办公室 HTTP 网关」 |

## 办公室 HTTP 网关（同事跨设备调用）

在一台**常开的办公机或内网服务器**上配置 **`meritco.local.env`**（久谦凭证与本地一致，建议有效 **`MERITCO_STORAGE_STATE` / `meritco-auth.json`**），然后：

```bash
npm run build
npm run gateway
```

| 变量 | 说明 |
|------|------|
| `MERITCO_GATEWAY_API_KEY` | **必填**，≥8 字符，随机串；交给同事作密钥，勿提交 Git |
| `MERITCO_GATEWAY_PORT` | 默认 `8787` |
| `MERITCO_GATEWAY_HOST` | 默认 `0.0.0.0`（局域网可访问） |
| `MERITCO_GATEWAY_ALLOW_IPS` | 可选：逗号分隔**客户端公网/内网 IP**（精确匹配），不配则仅依赖 API Key |
| `MERITCO_GATEWAY_CORS_ORIGIN` | 可选：浏览器跨域源；不配则 `*` |

**接口**：`GET /health`；`POST /v1/universal-search`（或 `/v1/search`），JSON body：`{ "query": "必填", "conversationId"?, "timeoutMs"?, "category"? }`。Header：`Authorization: Bearer <API_KEY>` 或 `X-Meritco-Gateway-Key: <API_KEY>`。成功 `{ "ok": true, "text": "..." }`；失败 HTTP 4xx/502 与 `{ "ok": false, "error": "..." }`。网关内对通用查询 **串行排队**，减轻久谦 514。

同事示例（将 `HOST`、`KEY` 换成你的内网 IP 与密钥）：

```bash
curl -sS -X POST "http://HOST:8787/v1/universal-search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer KEY" \
  -d "{\"query\":\"测试问题\"}"
```

**安全**：只发 API Key，勿外传久谦 Cookie；防火墙限制端口仅办公网段。

## 本地验收（不含真实 Cookie）

1. 将示例配置复制为 `meritco.http.json` 并填入**真实**接口路径（示例中的 `/api/example/...` 仅为占位）。
2. 设置 `MERITCO_COOKIE` 为当前有效 Cookie。
3. 可先不启 MCP，在项目根执行 `npm run build` 后：
   - **HTTP（辅助搜索联想等）：** `npm run query -- "测试问题"`
   - **Playwright（bot 页长文 / 通用查询）：** 先 `npm run playwright:install`，再 `npm run query:pw -- "测试问题"` 或 `npm run query:uni -- "测试问题"`（需根目录 `meritco.playwright.json` 与有效登录态）
4. 运行 `node dist/server.js`，在 MCP 中可调用 `meritco_universal_search`、`meritco_history_get` 等。
5. 成功时应只返回正文字符串；Cookie 失效时应返回 `isError` 与可读中文错误信息。

## Cursor 接入示例

参见 [examples/cursor-mcp-config.json](examples/cursor-mcp-config.json)，将其中路径与 `env` 改为本机值后合并到 Cursor 的 MCP 配置中（具体菜单位置以 Cursor 版本为准：Settings → MCP）。

## 安全说明

- 日志与错误信息中**不会**打印完整 `MERITCO_COOKIE`，仅可能记录其长度。
- 勿将含 Cookie 的 HAR 或 `.env` 提交到仓库。
