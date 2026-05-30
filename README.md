# jqmcp — 久谦平台 MCP 工具集

一个把**久谦中台** 25 个研究页面封装成 MCP 工具的本地服务，Cursor / Claude Desktop / 任意 MCP 客户端都可以直接调用。每个工具内部用 Playwright 无头浏览器在你登录过的久谦账号里执行查询、抓取右侧报告区正文，并 prettify 成结构化 markdown 返回。

---

## 25 个工具一览

| # | 工具名 | 久谦菜单 | URL 末段 | 典型用途 |
|---|---|---|---|---|
| 1 | `meritco_universal_search` | 通用查询 | `/search/universal` | bot 通用问答，长文研究 |
| 2 | `meritco_consumption_scenario_analysis` | 用户 > 消费场景分析 | `/report/mec` | 品类/品牌的消费场景拆解 |
| 3 | `meritco_user_satisfaction` | 用户 > 满意度分析 | `/report/sentiment` | NPS / 正负面观点 |
| 4 | `meritco_emotion_analysis` | 用户 > 情绪分析 | `/report/emotion` | 情绪占比 / 情绪标签 |
| 5 | `meritco_market_micro_scene` | 市场 > 微场景 | `/report/market-micro-scene` | CDST 六维度细分微场景 |
| 6 | `meritco_product_value_positioning` | 市场 > 产品价值定位 | `/report/market/productValue` | 功能 / 情感 / 象征三层价值 |
| 7 | `meritco_compete_discovery` | 市场 > 竞品发现与对标 | `/report/databank/competeV2` | 竞品图谱 + 对标候选 |
| 8 | `meritco_consumer_journey` | 市场 > 消费者旅程 | `/report/market/journey` | 认知/兴趣/购买/分享旅程 |
| 9 | `meritco_trend_analysis` | 商品 > 流行趋势 | `/report/productDesignTrend` | 风格 / 配色 / 工艺等设计要素趋势 |
| 10 | `meritco_element_analysis` | 商品 > 具体元素分析 | `/report/productAnalytic` | 成分 / 卖点 / 关键词逐项拆解 |
| 11 | `meritco_brand_identity` ⚠️ | 市场 > 品牌 > 品牌主张 | `/report/identity` | **两阶段**：候选账号→选定后拉报告 |
| 12 | `meritco_brand_association` | 市场 > 品牌 > 品牌联想 | `/report/association` | 联想词分布 / 心智第一反应 |
| 13 | `meritco_brand_archetype` | 市场 > 品牌 > 品牌原型 | `/report/brandArchetype` | 荣格 12 原型占比 |
| 14 | `meritco_brand_personality` | 市场 > 品牌 > 品牌性格 | `/report/personality` | Big Five 个性维度 |
| 15 | `meritco_brand_asset` | 市场 > 品牌 > 品牌资产 | `/report/brandAsset` | 知名度/忠诚度/美誉度 Brand Equity |
| 16 | `meritco_ip_collaboration` | 营销 > 联名与代言 | `/report/ipV2` | IP 联名 / 代言人盘点 |
| 17 | `meritco_kol_discovery` | 营销 > 达人筛选 | `/report/kol` | **达人 ID/昵称**画像 + 商业能力 |
| 18 | `meritco_narrative_framework` | 营销 > 叙事架构 | `/report/hotpost` | 热门帖叙事母题 + 88 篇爆文 |
| 19 | `meritco_topic_traffic` | 营销 > 话题流量 | `/report/topic` | 话题 / hashtag 流量分布 |
| 20 | `meritco_marketing_assessment` ⚠️ | 营销 > 营销有效性 | `/report/assessment` | **双输入框** brand + target |
| 21 | `meritco_category_dynamics` | 运营 > 品类动态与机会 | `/report/databank/cate` | 品类 databank |
| 22 | `meritco_brand_performance` | 运营 > 品牌定位与业绩 | `/report/databank/brand` | 品牌业绩 databank |
| 23 | `meritco_product_potential` | 运营 > 商品潜力 | `/report/databank/spu` | SKU/SPU databank |
| 24 | `meritco_food_hotspot` | 其他 > 餐饮榜单 | `/report/hotspot` | 推荐菜 / 品牌 / 城市排行 |
| 25 | `meritco_media_volume` ⚠️ | 其他 > 声量 | `/report/media_volume` | 关键词声量；**特殊语法**：双空格=AND / 双分号=OR |

⚠️ 三个特殊形态：
- **`brand_identity`** —— 两阶段调用：先传 `query` 拿候选账号列表，挑一个 `accountId` 再调一次拿完整报告
- **`marketing_assessment`** —— 双参数：`brand` + `target`，例 `(brand="蜜雪冰城", target="520情侣证")`
- **`media_volume`** —— 单输入框但支持组合查询：`A  B`（双空格 = AND）/ `A;;B`（双分号 = OR）

---

## 快速开始（本地）

### 1. 环境

- Node.js 18+
- Python 3.10+（如果要起 FastMCP 暴露给同事）

### 2. 安装

```bash
npm install
npm run build
npx playwright install chromium
```

### 3. 登录久谦（一次性，注入持久化 profile）

```bash
npm run meritco:profile
```

弹出 Chromium，正常登录久谦。**之后所有工具都复用这个登录态**，目录在 `meritco-chromium-profile/`。

> 重要：每次新接一个工具页面（例如第一次访问 `/report/brandArchetype`）建议手动点开一次让 cookies 写入 profile，避免工具首次调用被踢回登录页。

### 4. 命令行试跑

每个工具都有一个 `npm run query:<前缀>` 脚本：

```bash
# 完整对照表
npm run query:uni  -- "什么是茶饮赛道的护城河"      # 通用查询
npm run query:mec  -- "防晒霜"                       # 消费场景
npm run query:sat  -- "小米SU7 vs 理想MEGA"          # 满意度
npm run query:emo  -- "花西子 vs 完美日记"           # 情绪
npm run query:mms  -- "防晒喷雾"                     # 微场景
npm run query:pv   -- "蜜雪冰城"                     # 产品价值
npm run query:cmp  -- "瑞幸 vs Manner"               # 竞品发现
npm run query:cj   -- "小米SU7"                      # 消费者旅程
npm run query:trd  -- "国货美妆"                     # 流行趋势
npm run query:elm  -- "小米SU7"                      # 具体元素分析
npm run query:idt  -- "蜜雪冰城"                     # 品牌主张 阶段一
npm run query:idt  -- "蜜雪冰城" "1997MXBC"          # 品牌主张 阶段二
npm run query:asn  -- "蜜雪冰城"                     # 品牌联想
npm run query:arc  -- "耐克"                         # 品牌原型
npm run query:per  -- "Manner"                       # 品牌性格
npm run query:ast  -- "蜜雪冰城"                     # 品牌资产
npm run query:ipc  -- "蜜雪冰城"                     # 联名与代言
npm run query:kol  -- "李佳琦"                       # 达人筛选
npm run query:nrf  -- "蜜雪冰城"                     # 叙事架构
npm run query:tpc  -- "雪王"                         # 话题流量
npm run query:mka  -- "蜜雪冰城" "520情侣证"         # 营销有效性 双输入
npm run query:cat  -- "即饮茶"                       # 品类动态
npm run query:bpf  -- "蜜雪冰城"                     # 品牌定位与业绩
npm run query:spu  -- "防晒喷雾"                     # 商品潜力
npm run query:fhs  -- "火锅"                         # 餐饮榜单
npm run query:mvl  -- "蜜雪冰城  雪王"               # 声量 AND
npm run query:mvl  -- "蜜雪冰城;;茶颜悦色"           # 声量 OR
```

> 单次调用一般 30s ~ 2min（含 Chromium 启动 + 页面生成）。`brand_identity` 阶段二约 70-100s。

---

## 接入 Cursor / Claude Desktop

### 方式 A：本地 stdio（最简单，只给自己用）

在 Cursor MCP 配置里加：

```json
{
  "mcpServers": {
    "jqmcp": {
      "command": "node",
      "args": ["c:\\Users\\ASUS\\Desktop\\JQMCP\\dist\\server.js"]
    }
  }
}
```

### 方式 B：HTTP / SSE（给同事用，跨设备）

参见下一节「暴露给同事」。

---

## 暴露给同事（FastMCP HTTP 服务）

`mcp-server/` 是基于 FastMCP 的 Python 包装，把上面 25 个工具用 HTTP / SSE 协议暴露给同事。

### 1. 启服务

```bash
# 项目根
.\mcp-server\.venv\Scripts\python.exe server.py
```

默认 `0.0.0.0:8000`，端点 `http://<内网IP>:8000/mcp/`。健康检查 `GET /health` 会返回 25 个工具的 ok 状态。

需要本机外可访问：
- `HOST=0.0.0.0`（默认）
- Windows 防火墙放行端口 8000（管理员 PowerShell）：
  ```powershell
  New-NetFirewallRule -DisplayName "jqmcp-8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
  ```

### 2. 同事的 Cursor MCP 配置

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

### 3. 冒烟测试脚本

```bash
.\mcp-server\.venv\Scripts\python.exe mcp-server\smoke_client.py
.\mcp-server\.venv\Scripts\python.exe mcp-server\smoke_brand_identity_e2e.py
```

### 4. 注意

- 服务跑起来后，**你不能再用 `npm run meritco:profile` 手动开浏览器**（持久化 profile 同一时刻只能被一个 Chromium 进程占用）。要登录或排查页面，先停服务。
- **服务进程同一时刻只跑一个查询**（`_query_lock`），多个同事并发会自动排队。代价是后到的等前面跑完（30s~2min）。
- 你的电脑必须**开着 + 连公司网 + 久谦登录态有效**，否则同事请求会失败。

---

## 资源消耗

| 状态 | 内存 | CPU | 说明 |
|---|---|---|---|
| 服务空闲 | 80-150 MB | ~0% | uvicorn + FastMCP 常驻 |
| 调用工具时 | 额外 200-400 MB | 1-2 核短时占用 | 临时 Chromium，调完即关 |
| 持久化 profile（磁盘） | 200-500 MB | - | `meritco-chromium-profile/` 常驻 |

---

## 重要注意（容易踩的坑）

1. **登录态失效** 是最常见问题。强杀浏览器进程（`taskkill /F`）会让 cookies 不正常 flush，下次跑工具被踢回登录页。**关浏览器请优先点窗口右上角 X 正常退出**。
2. **新接的页面首次访问会被踢登录页** —— 因为持久化 profile 里没有该 URL 的页面级权限缓存。开 `npm run meritco:profile`，手动访问一次新页面再点 X 关，cookies 就有了。
3. **环境变量残留**：本地调试时如果用过 `$env:MERITCO_PLAYWRIGHT_HEADLESS="0"`，同一 PowerShell 会话里再跑工具仍是 headed 模式。重启 shell 或显式 `Remove-Item Env:\MERITCO_PLAYWRIGHT_HEADLESS`。
4. **久谦 Beta 工具的"生成中止"**：部分 Beta 页面遇到样本不足/限流时会主动中止生成，工具会在响应头部加 `⚠️ 久谦平台对该关键词「xxx」的报告生成被中止` 警告，**不要把中止后的残缺报告当成完整报告呈现给用户**。
5. **声量工具的双空格 / 双分号**：PowerShell / shell 在传参时一定要带引号，`"蜜雪冰城  雪王"`、`"蜜雪冰城;;茶颜悦色"`。

---

## 配置文件 / 环境变量

每个工具都有自己的 `meritco.<name>.playwright.json` 配置，统一放在 `playwright-configs/` 子目录（向后兼容：放项目根目录也能识别）。99% 情况你不需要碰它们——除非要：
- 改 selector（页面 placeholder 变了）
- 调 `minStableTextLength`（短报告页提前接受）
- 加 `stripBeforeAny` 锚点（清理某些页面顶部教程文本）

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `MERITCO_PLAYWRIGHT_HEADLESS` | `1`（无头） | `0` = 弹窗（仅本机调试用，MCP 进程下设 `0` 会崩） |
| `MERITCO_USE_PERSIST_PROFILE` | `1` | `0` = 不用持久化，每次都开无痕，需自己登录 |
| `MERITCO_CHROMIUM_USER_DATA` | `./meritco-chromium-profile` | 持久化目录绝对路径 |
| `MERITCO_DEBUG_DEDUP` | - | `1` = 在 stderr 输出 dedup / poll 详细日志，排查报告生成卡顿用 |
| `MERITCO_QUERY_TIMEOUT_SEC` | `600` | Python 侧调 Node 子进程的总超时 |
| `MERITCO_<TOOL>_CONFIG` | - | 显式指定某个工具的配置文件绝对路径 |

---

## 回归测试（改完代码用）

每次改了 `meritcoPageAnalysis.ts` / 升级 Playwright / 接了新工具，跑一遍 mini smoke 快速验证 5 条最关键的代码路径没坏：

```bash
npm run smoke:mini
```

会串行跑 5 个 case，覆盖：

| # | 用例 | 检验点 |
|---|---|---|
| 1 | `universal_search` | 独立模块路径（不复用 page-analysis） |
| 2 | `brand_identity` 阶段一 | candidates 解析 + accountId 抽取 |
| 3 | `brand_identity` 阶段二 | REPORT_HEADER_PATTERN + 点击候选 + 报告稳定 |
| 4 | `marketing_assessment` | 双输入框定位 + 双参数拼接到标题 |
| 5 | `media_volume` AND 语法 | 双空格语义保留 + 通用 page-analysis |

总耗时约 **5-7 分钟**（串行，profile 互斥不能并行）。退出码：5 个全过 0；任意失败 1。完整日志（每个 case 的 stdout/stderr）保存到 `.jqmcp/smoke-mini-<时间戳>.log`。

跑前提醒：
- 没有别的 chromium 占着 `meritco-chromium-profile/`（否则会启动失败）
- 久谦登录态有效（如果某个 case 报"被跳转到登录页"，跑一次 `npm run meritco:profile` 重登）
- PowerShell 当前 session 里**没有** `MERITCO_PLAYWRIGHT_HEADLESS=0` 这种残留环境变量（脚本里已经强制 default 无头，但更稳的是清干净）

如果未来想覆盖全部 25 个工具，按 `smoke-mini.mjs` 的格式扩 cases 数组即可，总耗时会涨到 20-30 分钟。

## 故障排查速查

| 现象 | 可能原因 | 解决 |
|---|---|---|
| `被跳转到登录页` | profile 没该页面权限 / cookies 失效 | `npm run meritco:profile` 重新登录 + 访问该页面 |
| `启动持久化 Chromium 失败 / exitCode=21` | 之前的 Chromium 没死透占着 profile | `taskkill /F /T /PID <pid>`，或重启电脑 |
| `等待报告稳定超时` | 后端生成慢 / 卡死 | 加 `MERITCO_DEBUG_DEDUP=1` 看 poll 是否还在涨字数 |
| 报告头部带 `⚠️ 生成中止` | 久谦后端主动中止（样本不足/限流） | 换关键词、稍后重试 |
| 返回的是 `请挑一个 accountId` 候选表 | 你调的是 `brand_identity` 阶段一 | 从表里复制 ID，二次调用带 `accountId` 参数 |

---

## 架构

```
┌─────────────────────────┐    HTTP / stdio
│  Cursor / Claude / ...  │ ────────────────┐
└─────────────────────────┘                 ▼
                                ┌───────────────────────┐
                                │ mcp-server/server.py  │  FastMCP 包装层
                                │   (Python, HTTP)      │  把 25 个工具暴露成 MCP
                                └───────────────────────┘
                                            │ subprocess 串行
                                            ▼
                                ┌───────────────────────┐
                                │ scripts/run-*.mjs     │  Node CLI 入口
                                │   (Node, 25 个)       │
                                └───────────────────────┘
                                            │ import
                                            ▼
                                ┌───────────────────────┐
                                │ src/*Meritco.ts       │  工具薄包装
                                │   (TypeScript)        │
                                └───────────────────────┘
                                            │ 复用
                                            ▼
                                ┌───────────────────────┐
                                │ src/meritcoPageAnalysis.ts │  Playwright 核心
                                │   (启动 / 输入 / 等待 / 抽取) │
                                └───────────────────────┘
                                            │
                                            ▼
                                ┌───────────────────────┐
                                │ chromium + 持久化 profile │
                                │   research.meritco-group.com │
                                └───────────────────────┘
```

- **22 个单阶段工具** 全部走 `runMeritcoPageAnalysis`（统一的"启动→找输入框→提交→等待稳定→prettify"流程）
- **2 个特殊工具**（`brand_identity` 两阶段 / `marketing_assessment` 双输入框）有自己的 ts 模块，但复用 `meritcoPageAnalysis` 里的 helper（`prettyPrintReport` / 去重 / `resolveHeadless` 等）
- **`meritco_universal_search`** 走另一个独立路径（`universalMeritco.ts`）

---

## License / 安全

- 仓库里**不包含**任何久谦凭证；所有登录态都在你本地的 `meritco-chromium-profile/`
- 这个目录请**不要 commit 到 Git**（已在 `.gitignore`）
- 暴露给同事时，**他们看不到你的久谦账号信息**，只能调用你预先注册的 25 个工具，工具返回的是已经登录态背后的报告正文
