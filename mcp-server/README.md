# jqmcp 远程 MCP 服务（FastMCP）

将久谦 **通用查询**（`meritco_universal_search`）以 **HTTP MCP** 形式暴露给他人使用。  
实现仍由仓库根目录的 **Node + Playwright** 完成（与 Cursor 本地 stdio MCP 同源）。

## 目录结构

```
mcp-server/
├── server.py           # FastMCP 入口
├── requirements.txt    # Python 依赖
├── Procfile            # Railway / Heroku 等：web: python server.py
├── .env.example        # 环境变量示例
└── README.md
```

项目根目录还需保留：

- `dist/`（`npm run build`）
- `scripts/run-universal.mjs`
- `meritco.playwright.json`
- `meritco.local.env`（或平台环境变量）
- `meritco-chromium-profile/`（若 `MERITCO_USE_PERSIST_PROFILE=1`，需先在服务器登录一次）

## 一、服务器准备（首次）

在 **JQMCP 仓库根目录**（`mcp-server` 的上一级）执行：

```bash
npm install
npm run build
npx playwright install chromium
```

首次登录久谦（持久化 profile，推荐）：

```bash
npm run meritco:profile
```

在弹出浏览器中登录并进 bot，终端回车后，将 `meritco.local.env` 中设置 `MERITCO_USE_PERSIST_PROFILE=1`。

## 二、本地启动远程 MCP

```bash
cd mcp-server
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

默认：**HTTP**，`http://0.0.0.0:8000/mcp/`  
健康检查：`http://localhost:8000/health`

环境变量：

| 变量 | 说明 |
|------|------|
| `PORT` | 监听端口（云平台常自动注入） |
| `HOST` | 默认 `0.0.0.0` |
| `MCP_TRANSPORT` | `http`（默认）\| `sse` \| `stdio` |
| `MERITCO_QUERY_TIMEOUT_SEC` | Node 查询超时，默认 600 |
| `MERITCO_CONFIG_DIR` | 默认指向仓库根目录 |

## 三、部署到 Railway / Render 等

1. 将整个 **JQMCP 仓库** 部署到服务器（不能只上传 `mcp-server/` 子目录，除非根目录文件一并存在）。
2. **Root Directory** 可设为 `mcp-server`，**Build** 需在根目录安装 Node 并 build（示例）：

   ```bash
   cd .. && npm ci && npm run build && npx playwright install chromium && cd mcp-server && pip install -r requirements.txt
   ```

3. **Start Command**（若未用 Procfile）：

   ```bash
   python server.py
   ```

4. 在平台配置环境变量（或挂载 `meritco.local.env` 到仓库根），与本地 MCP 一致。

5. 将对外 URL 发给他人，例如：`https://your-app.up.railway.app/mcp/`

## 四、他人如何连接

### Cursor / Claude Desktop（远程 MCP）

在 MCP 配置中使用 **HTTP** 类型（以 Cursor 当前版本文档为准），URL 填：

```text
https://<你的域名>/mcp/
```

### 仅用 HTTP 调试

```bash
curl -sS https://<你的域名>/health
```

具体 MCP 客户端鉴权方式见 [FastMCP HTTP 部署文档](https://gofastmcp.com/deployment/http)；生产环境建议在反向代理或平台上增加 **API Key / IP 白名单**。

## 五、与仓库内其它入口的区别

| 入口 | 协议 | 适用 |
|------|------|------|
| `node dist/server.js` | stdio | 本机 Cursor |
| `npm run gateway` | REST JSON | 非 MCP 的 HTTP 调用方 |
| **`mcp-server/server.py`** | **HTTP MCP** | **他人远程接 MCP 协议** |

## 安全说明

- 勿将 `meritco.local.env`、Cookie、profile 目录提交到 Git。
- 公网暴露前务必加鉴权与 HTTPS；久谦账号凭证只保存在服务器环境变量中。
