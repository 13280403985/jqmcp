# jqmcp 同事一键接入指南

把这份文档发给同事，他们 3 分钟接入 → 在自己的 Cursor / Claude Desktop 里直接调用 jqmcp 的 25 个久谦平台工具。

---

## 1. 接入（30 秒）

打开 Cursor 的 MCP 配置文件（`Settings → MCP → 编辑 mcp.json`），加入：

```json
{
  "mcpServers": {
    "jqmcp": {
      "transport": "http",
      "url": "http://192.168.2.7:8000/mcp/"
    }
  }
}
```

> 已经有别的 MCP 服务的话，把 `"jqmcp": { ... }` 这一对加到现有 `"mcpServers"` 对象里就行。

保存后 Cursor 会自动连接，**Settings → MCP** 里 jqmcp 下面会列出 25 个工具。

如果连不上：
- 检查能 ping 通服务方电脑：`ping 192.168.2.7`
- 浏览器打开 http://192.168.2.7:8000/health 应该返回 JSON
- 都不通就找服务方确认服务和防火墙

---

## 2. 怎么用（最简单的方式）

**不用记工具名**。直接用自然语言提问，Agent 会自己挑工具。例如：

| 你说什么 | Agent 会调什么 |
|---|---|
| 「分析下蜜雪冰城的品牌主张」 | `meritco_brand_identity`（两阶段，自动处理） |
| 「比较一下花西子和完美日记的品牌人格」 | `meritco_brand_personality` |
| 「评估一下蜜雪冰城 520 情侣证活动的有效性」 | `meritco_marketing_assessment`（双参数） |
| 「李佳琦这个达人主要做什么内容？」 | `meritco_kol_discovery` |
| 「火锅菜品销量排行」 | `meritco_food_hotspot` |
| 「『蜜雪冰城』和『茶颜悦色』在小红书上的声量对比」 | `meritco_media_volume`（OR 语法） |
| 「关于茶饮赛道的护城河，给我做个综合研究」 | `meritco_universal_search` |

提问模糊时（例如「搜一下蜜雪冰城」），Agent 会**反问**让你选具体想看哪类报告。这是预期行为。

---

## 3. 25 个工具速查

| 类型 | 工具 | 干什么 |
|---|---|---|
| **通用** | `universal_search` | bot 通用问答 / 长文研究 |
| **用户** | `consumption_scenario_analysis` | 消费场景拆解 |
| | `user_satisfaction` | NPS / 正负面观点 |
| | `emotion_analysis` | 情绪占比 / 情绪标签 |
| | `consumer_journey` | 认知→购买→分享 6 阶段旅程 |
| **市场** | `market_micro_scene` | CDST 六维度微场景 |
| | `product_value_positioning` | 功能 / 情感 / 象征三层价值 |
| | `compete_discovery` | 竞品图谱 + 对标候选 |
| **商品** | `trend_analysis` | 设计要素趋势 |
| | `element_analysis` | 成分 / 卖点 / 关键词逐项 |
| **品牌** | `brand_identity` ⚠️ | 品牌主张（**两阶段**调用） |
| | `brand_association` | 联想词分布 / 心智第一反应 |
| | `brand_archetype` | 荣格 12 原型占比 |
| | `brand_personality` | Big Five 个性维度 |
| | `brand_asset` | Brand Equity 多维资产 |
| **营销** | `ip_collaboration` | IP 联名 / 代言人盘点 |
| | `kol_discovery` ⚠️ | 达人画像（**输入达人 ID/昵称**） |
| | `narrative_framework` | 热门帖叙事母题 |
| | `topic_traffic` | 话题 / hashtag 流量 |
| | `marketing_assessment` ⚠️ | 营销活动有效性（**双参数**） |
| **运营** | `category_dynamics` | 品类 databank |
| | `brand_performance` | 品牌业绩 databank |
| | `product_potential` | SKU/SPU databank |
| **其他** | `food_hotspot` | 餐饮榜单 |
| | `media_volume` ⚠️ | 关键词声量（**特殊语法**） |

---

## 4. ⚠️ 三个特殊工具（避免调错）

### `meritco_brand_identity`：两阶段调用

不能一次拿报告，必须**两步**：

```
Step 1: 调 { query: "蜜雪冰城" }
→ 返回候选账号 markdown 表格，含 accountId 列

Step 2: 从表里挑一个 accountId，调 { query: "蜜雪冰城", accountId: "1997MXBC" }
→ 返回该账号的完整品牌主张报告（5K+ 字）
```

Agent 一般会自动处理。但**如果你看到一份"请挑一个 accountId 二次调用"的候选列表**，那就是 Agent 在第一步停下了，跟它说"用第一个 ID 继续"就好。

### `meritco_marketing_assessment`：必须两个参数

```
brand：品牌名（如 "蜜雪冰城" / "瑞幸" / "耐克"）
target：营销对象（如 "520情侣证" / "椰云拿铁" / "CHBL高中联赛"）

两个都必填。
```

### `meritco_media_volume`：特殊查询语法

```
"蜜雪冰城"             单关键词常规检索
"蜜雪冰城  雪王"       双空格 = AND（两个词都要命中）
"蜜雪冰城;;茶颜悦色"   双分号 = OR（任一命中）
```

---

## 5. 注意事项

1. **每次工具调用 30s ~ 2min**。这是久谦平台生成报告需要的时间，不是慢——是真的在跑。
2. **多人同时调用会排队**。服务一次只跑一个查询（避免久谦风控），后到的等前面跑完。
3. **不要重复发同一个请求**。如果 Agent 还在等，多发几次只会让你的请求排队跑好几遍。
4. **看到带 `⚠️ 生成中止` 警告的报告**：是久谦后端样本不足/限流时的部分内容，不是完整报告。换个更主流的关键词或稍后重试。
5. **服务方电脑必须开着、连办公网、久谦登录态有效**。如果连不上或都跑失败，找服务方。
6. **不要问与消费品 / 品牌 / 市场无关的问题**（如编程、天气、新闻）。Agent 看到这种问题不会调 jqmcp，但你浪费一次思考。

---

## 6. 调试

| 现象 | 怎么办 |
|---|---|
| Cursor MCP 面板里 jqmcp 红色 / 连不上 | 浏览器开 http://192.168.2.7:8000/health 看是否返回 JSON；不返回找服务方 |
| 报告里有「⚠️ 久谦平台...被中止」 | 换更主流的关键词重试，或换不同工具看 |
| 工具调用一直转圈 | 正常 30s ~ 2min；超过 5 分钟还没返回找服务方看日志 |
| Agent 调用了不对的工具 | 用更明确的措辞（含"品牌主张/联想/性格/资产"等关键词），或者直接指定工具：「用 brand_personality 分析下花西子」 |
| 收到候选账号列表而不是报告 | brand_identity 第一阶段；跟 Agent 说"用第一个 ID 继续" |

---

## 7. 服务方信息

- 服务地址：http://192.168.2.7:8000/mcp/
- 健康检查：http://192.168.2.7:8000/health
- 服务方：< 填你的名字和工位 / 微信 >
- 服务时间：工作日工作时段（电脑关机 / 下班断网 = 服务不可用）

有问题随时找我。
