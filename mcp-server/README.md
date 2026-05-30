# jqmcp 远程 MCP 服务（FastMCP）

把项目根的 **25 个久谦工具**用 HTTP / SSE MCP 协议暴露给同事，让他们在自己电脑的 Cursor / Claude Desktop 里直连。底层仍由仓库根目录的 **Node + Playwright** 完成（与本地 stdio MCP 同源）。

> 工具完整清单请看 [项目根 README](../README.md)。

## 目录结构

```
mcp-server/
├── server.py                       # FastMCP 入口
├── requirements.txt                # Python 依赖
├── Procfile                        # 部署平台: web: python server.py
├── .env.example                    # 环境变量示例
├── smoke_client.py                 # 协议层冒烟测试（tools/list + brand_identity 阶段一）
├── smoke_brand_identity_e2e.py     # 两阶段端到端冒烟（拿候选→选 ID→拉报告）
└── README.md
```

项目根目录还需保留：

- `dist/`（`npm run build` 生成）
- `scripts/run-*.mjs`（25 个 CLI 脚本）
- `playwright-configs/meritco.*.playwright.json`（22 个工具配置，集中在 `playwright-configs/` 子目录；brand_identity / assessment 不需要配置文件）
- `meritco-chromium-profile/`（持久化登录态目录）

## 一、首次准备（服务器）

在 **项目根**（`mcp-server` 的上一级）执行：

```bash
npm install
npm run build
npx playwright install chromium
npm run meritco:profile        # 弹窗登录久谦，所有 25 个工具都会复用这个 profile
```

> 重要：每个新工具页面**首次访问要在 `meritco:profile` 里手动点过一次**，让 cookies 写入 profile，否则该页面首次工具调用会被踢回登录页。

Python 依赖（一次性）：

```bash
cd mcp-server
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## 二、启动服务

```bash
# 项目根（也可在 mcp-server 目录里直接 python server.py）
.\mcp-server\.venv\Scripts\python.exe server.py
```

启动后输出：

```
INFO  Starting MCP server 'jqmcp' with transport 'http' on http://0.0.0.0:8000/mcp
INFO  Uvicorn running on http://0.0.0.0:8000
```

- HTTP MCP 端点：`http://<host>:<port>/mcp/`
- 健康检查：`GET http://<host>:<port>/health` → 25 个工具的 ok 状态

## 三、环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `HOST` | `0.0.0.0` | 监听地址（同事访问要保留 `0.0.0.0`；只本机自测可设 `127.0.0.1`） |
| `PORT` | `8000` | 监听端口（被占用了就换一个） |
| `MCP_TRANSPORT` | `http` | `http` / `sse` / `stdio` |
| `MERITCO_QUERY_TIMEOUT_SEC` | `600` | 单次工具调用最长等多久（Node 子进程超时） |
| `MERITCO_CONFIG_DIR` | 项目根 | 配置文件查找目录 |
| `NODE_BIN` | `node` | 自定义 node 可执行路径 |

## 四、暴露给同事（内网）

### 1. 防火墙放行（管理员 PowerShell）

```powershell
New-NetFirewallRule -DisplayName "jqmcp-8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

### 2. 找内网 IP

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object IPAddress, InterfaceAlias
```

### 3. 同事的 MCP 配置

**Cursor**（`Settings → MCP → mcp.json`）：

```json
{
  "mcpServers": {
    "jqmcp": {
      "transport": "http",
      "url": "http://<你的内网IP>:8000/mcp/"
    }
  }
}
```

**Claude Desktop**（`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "jqmcp": {
      "url": "http://<你的内网IP>:8000/mcp/"
    }
  }
}
```

### 4. 给同事的"工具说明书"

直接把项目根 README 的「25 个工具一览」表格 + 「⚠️ 三个特殊形态」段落转发给他们就够了。重点提醒：

- `meritco_brand_identity` 是**两阶段**：先调 `{query: "蜜雪冰城"}` 拿候选账号表，从表里复制 accountId 后再调 `{query: "蜜雪冰城", accountId: "1997MXBC"}` 拿报告
- `meritco_marketing_assessment` 需要**两个参数**：`{brand: "...", target: "..."}`
- `meritco_kol_discovery` 输入是**达人 ID 或昵称**（不是品牌名）
- `meritco_media_volume` 支持**特殊查询语法**：`"A  B"` = AND，`"A;;B"` = OR

## 五、冒烟测试

服务起来后，跑两个内置脚本快速验证：

```bash
# 1. 协议层 + 阶段一（~5s）：验证 tools/list 列出 25 个工具 + 调 brand_identity 拿候选
$env:PYTHONIOENCODING="utf-8"
.\mcp-server\.venv\Scripts\python.exe mcp-server\smoke_client.py

# 2. 端到端两阶段（~2min）：协议层调 brand_identity 阶段一 → 自动取第一个 accountId → 阶段二拉报告
.\mcp-server\.venv\Scripts\python.exe mcp-server\smoke_brand_identity_e2e.py
```

成功标志：
- `smoke_client.py` 退出码 0 + `[smoke] [OK] tools/list 25 个工具齐全`（或截至当时实际数量）
- `smoke_brand_identity_e2e.py` 退出码 0 + 两阶段都通过 + 报告 ≥ 1000 字

环境变量可以改：`$env:JQMCP_SMOKE_URL` / `$env:JQMCP_SMOKE_QUERY`。

## 六、注意事项

1. **同时只能跑一个查询**：`_query_lock` 让 Python 侧串行执行，同事多人调用会自动排队。代价是后到的等前面跑完（一般 30s ~ 2min）。
2. **不能并发 profile**：服务跑起来后，**你不能再开 `npm run meritco:profile` 手动登录**（持久化 profile 同一时刻只能一个 Chromium 进程独占）。要登录或调试浏览器，先停服务。
3. **你的电脑必须开着、连公司网、久谦登录态有效**，否则同事请求会失败。
4. **强杀进程**会丢 cookies。要停服务请 `Ctrl+C` 或直接关 terminal，**不要** `taskkill /F`。
5. **Beta 工具的"生成中止"**：部分页面遇到样本不足/限流时久谦会主动中止生成，工具返回的报告**头部有 `⚠️ 生成中止` 警告**。同事的 Agent 看到这个警告应该意识到内容不完整。

## 七、部署到云平台（可选）

理论上可以部署到 Railway / Render 等，但 **Playwright + 持久化登录态** 在 serverless 环境不友好（profile 写在容器内每次部署会丢失）。**推荐就在办公室一台常开机上跑**。如果非要上云：

1. 整个 JQMCP 仓库（不仅 `mcp-server/`）部署
2. Build 命令需要在根目录安装 Node 和 Playwright：
   ```bash
   cd .. && npm ci && npm run build && npx playwright install chromium && cd mcp-server && pip install -r requirements.txt
   ```
3. Start：`python server.py`（或用 `Procfile`）
4. **挂载持久化卷给 `meritco-chromium-profile/`**，否则登录态每次重启就丢
5. 加 API Key / IP 白名单（FastMCP 不自带鉴权，靠平台或反向代理）

## 八、与其它入口对比

| 入口 | 协议 | 适用 |
|---|---|---|
| `node dist/server.js` | stdio | 本机 Cursor 直连 |
| `mcp-server/server.py` | **HTTP MCP** | **同事远程 / 跨设备 MCP** |
| `npm run gateway` | REST JSON | 非 MCP 客户端调用（如脚本、Webhook） |

## 九、安全

- 暴露给同事时，**他们看不到你的久谦账号信息**，只能调用预先注册的 25 个工具，返回的是已经登录态背后的报告正文
- 不要把 `meritco-chromium-profile/`、`meritco-auth.json`、Cookie 提交到 Git（已在 `.gitignore`）
- 公网暴露**务必**加鉴权（API Key / IP 白名单 / HTTPS）；内网用尚可裸跑
