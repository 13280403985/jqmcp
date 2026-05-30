"""
久谦通用查询 — 远程 MCP（FastMCP + HTTP/SSE）。

对外暴露 meritco_universal_search；实际查询由项目根目录的 Node + Playwright 执行
（scripts/run-universal.mjs，与本地 MCP stdio 版同源）。

部署前在仓库根目录执行：
  npm install && npm run build && npx playwright install chromium
并配置 meritco.playwright.json、meritco.local.env（或环境变量）。
"""

from __future__ import annotations

import os
import subprocess
import threading
from pathlib import Path

from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

# mcp-server/ 的上一级即 JQMCP 项目根（含 dist、scripts、meritco.playwright.json）
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RUN_UNIVERSAL = PROJECT_ROOT / "scripts" / "run-universal.mjs"
RUN_CONSUMPTION = PROJECT_ROOT / "scripts" / "run-consumption.mjs"
RUN_SATISFACTION = PROJECT_ROOT / "scripts" / "run-satisfaction.mjs"
RUN_EMOTION = PROJECT_ROOT / "scripts" / "run-emotion.mjs"
RUN_MARKET_MICRO_SCENE = PROJECT_ROOT / "scripts" / "run-market-micro-scene.mjs"
RUN_PRODUCT_VALUE = PROJECT_ROOT / "scripts" / "run-product-value.mjs"
RUN_COMPETE = PROJECT_ROOT / "scripts" / "run-compete.mjs"
RUN_JOURNEY = PROJECT_ROOT / "scripts" / "run-consumer-journey.mjs"
RUN_TREND = PROJECT_ROOT / "scripts" / "run-trend.mjs"
RUN_ELEMENT = PROJECT_ROOT / "scripts" / "run-element.mjs"
RUN_IDENTITY = PROJECT_ROOT / "scripts" / "run-identity.mjs"
RUN_ASSOCIATION = PROJECT_ROOT / "scripts" / "run-association.mjs"
RUN_ARCHETYPE = PROJECT_ROOT / "scripts" / "run-archetype.mjs"
RUN_PERSONALITY = PROJECT_ROOT / "scripts" / "run-personality.mjs"
RUN_BRAND_ASSET = PROJECT_ROOT / "scripts" / "run-brand-asset.mjs"
RUN_IP_COLLABORATION = PROJECT_ROOT / "scripts" / "run-ip-collaboration.mjs"
RUN_KOL = PROJECT_ROOT / "scripts" / "run-kol.mjs"
RUN_NARRATIVE = PROJECT_ROOT / "scripts" / "run-narrative.mjs"
RUN_TOPIC = PROJECT_ROOT / "scripts" / "run-topic.mjs"
RUN_ASSESSMENT = PROJECT_ROOT / "scripts" / "run-assessment.mjs"
RUN_CATEGORY = PROJECT_ROOT / "scripts" / "run-category.mjs"
RUN_BRAND_PERFORMANCE = PROJECT_ROOT / "scripts" / "run-brand-performance.mjs"
RUN_PRODUCT_POTENTIAL = PROJECT_ROOT / "scripts" / "run-product-potential.mjs"
RUN_FOOD_HOTSPOT = PROJECT_ROOT / "scripts" / "run-food-hotspot.mjs"
RUN_MEDIA_VOLUME = PROJECT_ROOT / "scripts" / "run-media-volume.mjs"

# 与 Node 网关一致：同一时刻只跑一条 Playwright 查询，减轻久谦侧抢会话
_query_lock = threading.Lock()

mcp = FastMCP(
    "jqmcp",
    instructions=(
        "久谦平台 MCP，共 25 个工具，覆盖久谦左侧菜单的全部研究页面。\n"
        "\n"
        "══════════ jqmcp 适用范围（必读，避免误用）══════════\n"
        "本服务仅适用于：**消费品行业的市场研究、品牌洞察、消费者分析、营销活动评估** 等领域。\n"
        "常见品类：茶饮 / 餐饮 / 美妆 / 个护 / 服装 / 3C / 汽车 / 家居家电 / 母婴 / 宠物 等。\n"
        "常见品牌：蜜雪冰城 / 瑞幸 / 耐克 / 花西子 / 小米SU7 / 蕉内 / Manner 等。\n"
        "\n"
        "⚠️ 不要在以下场景调用本服务的任何工具：\n"
        "  • 编程、技术问题、调试、写代码\n"
        "  • 数学、推理、文档翻译、文本润色\n"
        "  • 个人事务（天气、新闻、提醒、邮件草稿）\n"
        "  • 不属于消费品 / 品牌 / 营销 / 用研范畴的任何问题\n"
        "  这类问题应该由 LLM 自己回答，或交给其它工具处理。每次工具调用都会消耗 30s~2min\n"
        "  的时间和久谦平台的查询额度，乱调既慢又浪费。\n"
        "\n"
        "══════════ 模糊提问处理规则（属于范畴但措辞不明确时）══════════\n"
        "当用户的问题确认属于上述范畴但措辞模糊（例『搜一下蜜雪冰城』『看看花西子』\n"
        "『分析下小米SU7』），**不要默认走任何工具**。先反问澄清，给出 2-3 个最相关\n"
        "的工具供用户选择。例：\n"
        "  「你想看『蜜雪冰城』的哪一类？\n"
        "   - 品牌主张 / Slogan / 品牌叙事 → brand_identity\n"
        "   - 消费者怎么提到它（关键词云）→ brand_association\n"
        "   - 它在消费者眼里的人格画像 → brand_personality / brand_archetype\n"
        "   - 它的商业业绩盘点 → brand_performance\n"
        "   - bot 综合长文研究（兜底）→ universal_search」\n"
        "★ 不要默认走 brand_identity（它是两阶段，第一次调用只返回候选账号列表，\n"
        "  会让用户困惑）。除非用户明确说『品牌主张 / Slogan / 品牌定位 / 品牌叙事』\n"
        "  这些 brand_identity 强关键词，否则不要主动选它。\n"
        "\n"
        "══════════ 按业务场景反查（给 Agent 的速查表）══════════\n"
        "• 想看『消费者怎么想 / 怎么用』    → consumption_scenario_analysis / user_satisfaction / emotion_analysis / consumer_journey / market_micro_scene\n"
        "• 想看『品牌心智 / 品牌资产』      → brand_identity（两阶段）/ brand_association / brand_archetype / brand_personality / brand_asset\n"
        "• 想看『产品 / SKU / 元素』        → product_value_positioning / element_analysis / trend_analysis / product_potential\n"
        "• 想看『市场 / 品类 / 竞争』       → compete_discovery / category_dynamics / brand_performance\n"
        "• 想看『营销 / 活动 / 内容』       → ip_collaboration / kol_discovery（达人输入）/ narrative_framework / topic_traffic / marketing_assessment（双参数）\n"
        "• 想看『餐饮榜单 / 关键词声量』    → food_hotspot / media_volume\n"
        "• 自由问答 / 长文 bot 研究         → universal_search\n"
        "\n"
        "══════════ ★ 三个特殊形态（最易调错，务必看清）★ ══════════\n"
        "1. meritco_brand_identity 是【两阶段】：\n"
        "   ① 先调 {query: '蜜雪冰城'} 拿到候选账号 markdown 表（含 accountId）\n"
        "   ② 从表里选一个 accountId，再调 {query: '蜜雪冰城', accountId: '1997MXBC'} 拿完整报告\n"
        "   严禁瞎猜 accountId，必须先调一次拿真实 ID。\n"
        "2. meritco_marketing_assessment 是【双参数】：\n"
        "   必须同时传 brand + target，例 {brand: '蜜雪冰城', target: '520情侣证'}\n"
        "3. meritco_kol_discovery 输入是【达人 ID 或昵称】（不是品牌名），\n"
        "   如『李佳琦』、『1997MXBC』、『fanxin123』。\n"
        "\n"
        "══════════ 其它注意 ══════════\n"
        "• 单次工具调用约 30s ~ 2min（含浏览器启动 + 久谦后端报告生成）。串行排队，别一次性挂很多。\n"
        "• 部分 Beta 工具遇到样本不足会返回带 ⚠️ 生成中止 警告的部分报告，不要当完整报告呈现给用户。\n"
        "• 声量工具 media_volume 支持组合查询：单词常规 / `A  B`（双空格=AND）/ `A;;B`（双分号=OR），构造查询时双空格/双分号必须原样保留。\n"
        "\n"
        "══════════ 25 个工具完整清单 ══════════\n"
        "- meritco_universal_search：bot 通用查询，提交问题→返回页面生成的报告正文。\n"
        "- meritco_consumption_scenario_analysis：消费场景分析（菜单 /report/mec），"
        "输入品类/品牌/产品或对比表达式（如 `防晒霜 vs 防晒喷雾`）→ 返回页面报告正文。\n"
        "- meritco_user_satisfaction：满意度分析（菜单 /report/sentiment），"
        "输入品类/品牌/产品或对比/对标维度表达式（如 `小米SU7 vs 理想MEGA`、`小米SU7：对标性别`）"
        "→ 返回基于 NPS 的正/负面观点报告。\n"
        "- meritco_emotion_analysis：情绪分析（菜单 /report/emotion），"
        "输入品类/品牌/产品或对比/对标维度表达式（如 `花西子 vs 完美日记`、`小米SU7：对标性别`）"
        "→ 返回情绪占比/情感倾向/情绪标签报告。\n"
        "- meritco_market_micro_scene：微场景（菜单 /report/market-micro-scene），"
        "输入品类/品牌/产品或对比/对标维度表达式（如 `防晒霜 vs 防晒喷雾`、`小米SU7：对标性别`）"
        "→ 返回细分消费微场景 / 场景分布 / 场景驱动报告。\n"
        "- meritco_product_value_positioning：产品价值定位（菜单 /report/market/productValue），"
        "输入品类/品牌/产品或对比/对标维度表达式（如 `花西子 vs 完美日记`、`小米SU7：对标性别`）"
        "→ 返回价值主张 / 功能-情感-象征价值 / 差异化定位报告。\n"
        "- meritco_compete_discovery：竞品发现与对标（菜单 /report/databank/competeV2），"
        "输入品类/品牌/产品或对比/对标维度表达式（如 `小米SU7 vs 理想MEGA`、`花西子：对标年龄`）"
        "→ 返回竞品图谱 / 对标候选 / 竞争格局 / 差异化对比报告。\n"
        "- meritco_consumer_journey:消费者旅程（菜单 /report/market/journey），"
        "输入品类/品牌/产品或对比/对标维度表达式（如 `小米SU7`、`花西子 vs 完美日记`、`小米SU7：对标性别`）"
        "→ 返回认知/兴趣/比较/购买/使用/分享 各阶段触点 + 转化漏斗 + 流失节点报告。\n"
        "- meritco_trend_analysis：流行趋势 / 产品设计趋势（菜单 /report/productDesignTrend），"
        "输入品类/品牌/产品或对比/对标维度表达式（如 `小米SU7`、`花西子 vs 完美日记`、`小米SU7：对标性别`）"
        "→ 返回风格 / 配色 / 形态 / 功能 / 材质 / 工艺 / 包装 / 卖点 等设计要素的趋势演变与典型案例。\n"
        "- meritco_element_analysis：具体元素分析（菜单 /report/productAnalytic），"
        "输入品类/品牌/产品或对比/对标维度表达式（如 `小米SU7`、`花西子 vs 完美日记`、`小米SU7：对标性别`）"
        "→ 返回成分 / 卖点 / 特性 / 关键词 / 标签 / 包装元素 / 配方元素 等逐项拆解 + 单元素提及度/满意度/典型案例。\n"
        "- meritco_brand_identity：品牌主张（菜单 /report/identity），**两阶段调用**：\n"
        "    阶段一 只传 query（品牌名，如 `蜜雪冰城`）→ 返回候选账号 markdown 表（含 accountId / 粉丝 / 互动量）；\n"
        "    阶段二 同时传 query + accountId（如 `1997MXBC`）→ 返回该账号的品牌主张完整报告（品牌定位 / 核心价值 / Slogan / 品牌人格 / 品牌叙事 等）。\n"
        "    严禁瞎猜 accountId，必须先调一次拿到候选 ID。\n"
        "- meritco_brand_association：品牌联想（菜单 /report/association），"
        "输入品牌/品类或对比/对标维度表达式（如 `蜜雪冰城`、`蕉内`、`花西子 vs 完美日记`、`小米SU7：对标性别`）"
        "→ 返回该品牌/品类的联想词分布 / 关键词云 / 心智第一反应 / 联想词竞争格局报告。\n"
        "- meritco_brand_archetype：品牌原型（菜单 /report/brandArchetype），"
        "输入品牌或对比/对标维度表达式（如 `耐克`、`小米汽车 vs 理想汽车`、`小米SU7：对标性别`、`花西子：对标年龄`）"
        "→ 返回基于荣格 12 种品牌原型（爱人/纯真者/创造者/关怀者/魔法师/探险家/英雄/反叛者/凡夫俗子/统治者/智者/开心果）的占比与典型证据报告。\n"
        "- meritco_brand_personality：品牌性格（菜单 /report/personality），"
        "输入品牌或对比/对标维度表达式（如 `Manner`、`蜜雪冰城`、`花西子 vs 完美日记`、`小米SU7：对标性别`）"
        "→ 返回基于 Brand Personality Big Five（真诚 / 激情 / 精致 / 可靠 / 强韧）5 维度的占比与典型证据报告。\n"
        "- meritco_brand_asset：品牌资产（菜单 /report/brandAsset），"
        "输入品牌或对比/对标维度表达式（如 `蜜雪冰城`、`耐克`、`小米汽车 vs 理想汽车`、`花西子：对标年龄`）"
        "→ 返回 Brand Equity / Brand Asset 视角（知名度 / 忠诚度 / 美誉度 / 联想度 / 感知质量 / 议价权 / 渠道力 等）多维占比与典型证据报告。\n"
        "- meritco_ip_collaboration：联名与代言（菜单 /report/ipV2 Beta），"
        "输入品牌或对比表达式（如 `蜜雪冰城`、`瑞幸 vs Manner`）"
        "→ 返回品牌的 IP 联名 / 代言人 / 跨界合作资产盘点报告。\n"
        "- meritco_kol_discovery：达人筛选与生成（菜单 /report/kol Beta），"
        "★ 输入是**达人 ID 或达人昵称**（不是品牌名）（如 `李佳琦`、`1997MXBC`、`fanxin123`）"
        "→ 返回该达人画像 / 内容偏好 / 粉丝结构 / 商业能力 / 适配品类 / 历史合作品牌报告。\n"
        "- meritco_narrative_framework：叙事架构（菜单 /report/hotpost Beta），"
        "输入品牌或品类或对比表达式（如 `蜜雪冰城`、`雪王`、`小米SU7 vs 理想MEGA`）"
        "→ 返回热门内容的叙事框架报告（核心叙事母题 / 话题切入点 / 热门帖结构 / 传播路径）。\n"
        "- meritco_topic_traffic：话题流量（菜单 /report/topic Beta），"
        "输入品牌/品类/话题或对比表达式（如 `蜜雪冰城`、`雪王`、`520`、`小米SU7：对标性别`）"
        "→ 返回话题 / hashtag 的流量分布报告（热门话题排行 / 流量趋势 / 话题关联品牌 / 话题生命周期）。\n"
        "- meritco_marketing_assessment：营销有效性（菜单 /report/assessment Beta），"
        "★ **唯一双参数工具**：brand + target 都必填。例如 brand=`蜜雪冰城` target=`520情侣证`，"
        "brand=`瑞幸` target=`椰云拿铁`，brand=`耐克` target=`CHBL高中联赛`。"
        "→ 返回『某品牌 × 某具体营销动作』的有效性评估报告（曝光 / 互动 / 声量 / 用户反馈 / ROI 信号 / 是否破圈）。\n"
        "- meritco_category_dynamics：品类动态与机会（菜单 /report/databank/cate Beta），"
        "输入品类关键词（如 `新茶饮`、`新能源车`、`防晒霜`）"
        "→ 返回品类整体动态 / 增长机会 / 细分赛道 / 天花板 / 新兴趋势 databank 视角盘点。\n"
        "- meritco_brand_performance：品牌定位与业绩（菜单 /report/databank/brand Beta），"
        "输入品牌关键词（如 `蜜雪冰城`、`小米SU7`、`花西子`）"
        "→ 返回品牌定位（价格带 / 站位 / 人群）+ 业绩盘点（声量 / 销量 / 增长 / 份额 / 复购）。\n"
        "- meritco_product_potential：商品潜力（菜单 /report/databank/spu Beta，颗粒度到 SKU/SPU），"
        "输入商品关键词（如 `防晒喷雾`、`雪王霸气桶`、`小米SU7 Max`）"
        "→ 返回市场潜力 / 销量预测 / 定价空间 / 竞品 SPU 对比 / 同类替代风险报告。\n"
        "- meritco_food_hotspot：餐饮榜单（菜单 /report/hotspot），"
        "输入餐饮品牌 / 菜系 / 城市（如 `蜜雪冰城`、`火锅`、`上海`）"
        "→ 返回餐饮垂直行业的热度榜单（粉丝增长 / 声量 / 上新 / 热门门店 / 人气排行）。\n"
        "- meritco_media_volume：声量（菜单 /report/media_volume），"
        "★ 支持组合查询语法：单词常规 / **双空格=AND** / **双分号=OR**（如 `蜜雪冰城`、`蜜雪冰城  雪王`、`蜜雪冰城;;茶颜悦色`）"
        "→ 返回关键词在社媒（微博 / 小红书 / 抖音）的声量分布 / 帖子数 / 互动量 / 时间趋势。\n"
        "二十五者均由 Playwright 无头浏览器执行，调用方无需自行开浏览器。"
    ),
)


def _env_for_node() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("MERITCO_CONFIG_DIR", str(PROJECT_ROOT))
    # 远程部署默认无头；需要弹窗调试时在宿主机设 MERITCO_PLAYWRIGHT_HEADLESS=0
    return env


def _run_node_script(
    script_path: Path,
    query: str,
    dist_check: Path,
    extra_args: list[str] | None = None,
) -> str:
    """同步调用 Node CLI 脚本，串行执行。返回 stdout 文本。

    extra_args：传给 Node 脚本的额外 argv（例如 identity 的 accountId）。
    """
    if not script_path.is_file():
        raise RuntimeError(
            f"未找到 {script_path}。请在项目根目录执行 npm run build。"
        )
    if not dist_check.is_file():
        raise RuntimeError(
            f"未找到 {dist_check}。请在项目根目录执行：npm run build"
        )

    timeout_sec = int(os.environ.get("MERITCO_QUERY_TIMEOUT_SEC", "600"))
    node = os.environ.get("NODE_BIN", "node")

    argv = [node, str(script_path), query]
    if extra_args:
        argv.extend(str(a) for a in extra_args)

    with _query_lock:
        proc = subprocess.run(
            argv,
            cwd=str(PROJECT_ROOT),
            env=_env_for_node(),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_sec,
        )

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(err or f"Node 进程退出码 {proc.returncode}")

    out = (proc.stdout or "").strip()
    if not out:
        raise RuntimeError("Playwright 未返回正文（stdout 为空）")
    return out


def _run_node_universal_search(query: str) -> str:
    return _run_node_script(
        RUN_UNIVERSAL,
        query,
        PROJECT_ROOT / "dist" / "universalMeritco.js",
    )


def _run_node_consumption_scenario(query: str) -> str:
    return _run_node_script(
        RUN_CONSUMPTION,
        query,
        PROJECT_ROOT / "dist" / "consumptionScenarioMeritco.js",
    )


def _run_node_user_satisfaction(query: str) -> str:
    return _run_node_script(
        RUN_SATISFACTION,
        query,
        PROJECT_ROOT / "dist" / "userSatisfactionMeritco.js",
    )


def _run_node_emotion_analysis(query: str) -> str:
    return _run_node_script(
        RUN_EMOTION,
        query,
        PROJECT_ROOT / "dist" / "emotionAnalysisMeritco.js",
    )


def _run_node_market_micro_scene(query: str) -> str:
    return _run_node_script(
        RUN_MARKET_MICRO_SCENE,
        query,
        PROJECT_ROOT / "dist" / "marketMicroSceneMeritco.js",
    )


def _run_node_product_value(query: str) -> str:
    return _run_node_script(
        RUN_PRODUCT_VALUE,
        query,
        PROJECT_ROOT / "dist" / "productValueMeritco.js",
    )


def _run_node_compete(query: str) -> str:
    return _run_node_script(
        RUN_COMPETE,
        query,
        PROJECT_ROOT / "dist" / "competeMeritco.js",
    )


def _run_node_consumer_journey(query: str) -> str:
    return _run_node_script(
        RUN_JOURNEY,
        query,
        PROJECT_ROOT / "dist" / "consumerJourneyMeritco.js",
    )


def _run_node_trend(query: str) -> str:
    return _run_node_script(
        RUN_TREND,
        query,
        PROJECT_ROOT / "dist" / "trendMeritco.js",
    )


def _run_node_element(query: str) -> str:
    return _run_node_script(
        RUN_ELEMENT,
        query,
        PROJECT_ROOT / "dist" / "elementMeritco.js",
    )


def _run_node_identity(query: str, account_id: str | None = None) -> str:
    extra = [account_id] if account_id else None
    return _run_node_script(
        RUN_IDENTITY,
        query,
        PROJECT_ROOT / "dist" / "identityMeritco.js",
        extra_args=extra,
    )


def _run_node_association(query: str) -> str:
    return _run_node_script(
        RUN_ASSOCIATION,
        query,
        PROJECT_ROOT / "dist" / "associationMeritco.js",
    )


def _run_node_archetype(query: str) -> str:
    return _run_node_script(
        RUN_ARCHETYPE,
        query,
        PROJECT_ROOT / "dist" / "archetypeMeritco.js",
    )


def _run_node_personality(query: str) -> str:
    return _run_node_script(
        RUN_PERSONALITY,
        query,
        PROJECT_ROOT / "dist" / "personalityMeritco.js",
    )


def _run_node_brand_asset(query: str) -> str:
    return _run_node_script(
        RUN_BRAND_ASSET,
        query,
        PROJECT_ROOT / "dist" / "brandAssetMeritco.js",
    )


def _run_node_ip_collaboration(query: str) -> str:
    return _run_node_script(
        RUN_IP_COLLABORATION,
        query,
        PROJECT_ROOT / "dist" / "ipCollaborationMeritco.js",
    )


def _run_node_kol(query: str) -> str:
    return _run_node_script(
        RUN_KOL,
        query,
        PROJECT_ROOT / "dist" / "kolMeritco.js",
    )


def _run_node_narrative(query: str) -> str:
    return _run_node_script(
        RUN_NARRATIVE,
        query,
        PROJECT_ROOT / "dist" / "narrativeMeritco.js",
    )


def _run_node_topic(query: str) -> str:
    return _run_node_script(
        RUN_TOPIC,
        query,
        PROJECT_ROOT / "dist" / "topicMeritco.js",
    )


def _run_node_assessment(brand: str, target: str) -> str:
    """营销有效性是唯一的双参数工具：brand 走 argv[1]，target 走 argv[2]。"""
    return _run_node_script(
        RUN_ASSESSMENT,
        brand,
        PROJECT_ROOT / "dist" / "assessmentMeritco.js",
        extra_args=[target],
    )


def _run_node_category(query: str) -> str:
    return _run_node_script(
        RUN_CATEGORY,
        query,
        PROJECT_ROOT / "dist" / "categoryMeritco.js",
    )


def _run_node_brand_performance(query: str) -> str:
    return _run_node_script(
        RUN_BRAND_PERFORMANCE,
        query,
        PROJECT_ROOT / "dist" / "brandPerformanceMeritco.js",
    )


def _run_node_product_potential(query: str) -> str:
    return _run_node_script(
        RUN_PRODUCT_POTENTIAL,
        query,
        PROJECT_ROOT / "dist" / "productPotentialMeritco.js",
    )


def _run_node_food_hotspot(query: str) -> str:
    return _run_node_script(
        RUN_FOOD_HOTSPOT,
        query,
        PROJECT_ROOT / "dist" / "foodHotspotMeritco.js",
    )


def _run_node_media_volume(query: str) -> str:
    return _run_node_script(
        RUN_MEDIA_VOLUME,
        query,
        PROJECT_ROOT / "dist" / "mediaVolumeMeritco.js",
    )


@mcp.custom_route("/health", methods=["GET"])
async def health(_request: Request) -> JSONResponse:
    """供 Railway / 负载均衡探活。"""
    uni_ok = RUN_UNIVERSAL.is_file() and (PROJECT_ROOT / "dist" / "universalMeritco.js").is_file()
    mec_ok = RUN_CONSUMPTION.is_file() and (
        PROJECT_ROOT / "dist" / "consumptionScenarioMeritco.js"
    ).is_file()
    sat_ok = RUN_SATISFACTION.is_file() and (
        PROJECT_ROOT / "dist" / "userSatisfactionMeritco.js"
    ).is_file()
    emo_ok = RUN_EMOTION.is_file() and (
        PROJECT_ROOT / "dist" / "emotionAnalysisMeritco.js"
    ).is_file()
    mms_ok = RUN_MARKET_MICRO_SCENE.is_file() and (
        PROJECT_ROOT / "dist" / "marketMicroSceneMeritco.js"
    ).is_file()
    pv_ok = RUN_PRODUCT_VALUE.is_file() and (
        PROJECT_ROOT / "dist" / "productValueMeritco.js"
    ).is_file()
    cmp_ok = RUN_COMPETE.is_file() and (
        PROJECT_ROOT / "dist" / "competeMeritco.js"
    ).is_file()
    cj_ok = RUN_JOURNEY.is_file() and (
        PROJECT_ROOT / "dist" / "consumerJourneyMeritco.js"
    ).is_file()
    trd_ok = RUN_TREND.is_file() and (
        PROJECT_ROOT / "dist" / "trendMeritco.js"
    ).is_file()
    elm_ok = RUN_ELEMENT.is_file() and (
        PROJECT_ROOT / "dist" / "elementMeritco.js"
    ).is_file()
    idt_ok = RUN_IDENTITY.is_file() and (
        PROJECT_ROOT / "dist" / "identityMeritco.js"
    ).is_file()
    asn_ok = RUN_ASSOCIATION.is_file() and (
        PROJECT_ROOT / "dist" / "associationMeritco.js"
    ).is_file()
    arc_ok = RUN_ARCHETYPE.is_file() and (
        PROJECT_ROOT / "dist" / "archetypeMeritco.js"
    ).is_file()
    per_ok = RUN_PERSONALITY.is_file() and (
        PROJECT_ROOT / "dist" / "personalityMeritco.js"
    ).is_file()
    ast_ok = RUN_BRAND_ASSET.is_file() and (
        PROJECT_ROOT / "dist" / "brandAssetMeritco.js"
    ).is_file()
    ipc_ok = RUN_IP_COLLABORATION.is_file() and (
        PROJECT_ROOT / "dist" / "ipCollaborationMeritco.js"
    ).is_file()
    kol_ok = RUN_KOL.is_file() and (
        PROJECT_ROOT / "dist" / "kolMeritco.js"
    ).is_file()
    nrf_ok = RUN_NARRATIVE.is_file() and (
        PROJECT_ROOT / "dist" / "narrativeMeritco.js"
    ).is_file()
    tpc_ok = RUN_TOPIC.is_file() and (
        PROJECT_ROOT / "dist" / "topicMeritco.js"
    ).is_file()
    mka_ok = RUN_ASSESSMENT.is_file() and (
        PROJECT_ROOT / "dist" / "assessmentMeritco.js"
    ).is_file()
    cat_ok = RUN_CATEGORY.is_file() and (
        PROJECT_ROOT / "dist" / "categoryMeritco.js"
    ).is_file()
    bpf_ok = RUN_BRAND_PERFORMANCE.is_file() and (
        PROJECT_ROOT / "dist" / "brandPerformanceMeritco.js"
    ).is_file()
    spu_ok = RUN_PRODUCT_POTENTIAL.is_file() and (
        PROJECT_ROOT / "dist" / "productPotentialMeritco.js"
    ).is_file()
    fhs_ok = RUN_FOOD_HOTSPOT.is_file() and (
        PROJECT_ROOT / "dist" / "foodHotspotMeritco.js"
    ).is_file()
    mvl_ok = RUN_MEDIA_VOLUME.is_file() and (
        PROJECT_ROOT / "dist" / "mediaVolumeMeritco.js"
    ).is_file()
    return JSONResponse(
        {
            "status": "healthy" if uni_ok else "degraded",
            "service": "jqmcp-mcp-server",
            "project_root": str(PROJECT_ROOT),
            "tools": {
                "meritco_universal_search": uni_ok,
                "meritco_consumption_scenario_analysis": mec_ok,
                "meritco_user_satisfaction": sat_ok,
                "meritco_emotion_analysis": emo_ok,
                "meritco_market_micro_scene": mms_ok,
                "meritco_product_value_positioning": pv_ok,
                "meritco_compete_discovery": cmp_ok,
                "meritco_consumer_journey": cj_ok,
                "meritco_trend_analysis": trd_ok,
                "meritco_element_analysis": elm_ok,
                "meritco_brand_identity": idt_ok,
                "meritco_brand_association": asn_ok,
                "meritco_brand_archetype": arc_ok,
                "meritco_brand_personality": per_ok,
                "meritco_brand_asset": ast_ok,
                "meritco_ip_collaboration": ipc_ok,
                "meritco_kol_discovery": kol_ok,
                "meritco_narrative_framework": nrf_ok,
                "meritco_topic_traffic": tpc_ok,
                "meritco_marketing_assessment": mka_ok,
                "meritco_category_dynamics": cat_ok,
                "meritco_brand_performance": bpf_ok,
                "meritco_product_potential": spu_ok,
                "meritco_food_hotspot": fhs_ok,
                "meritco_media_volume": mvl_ok,
            },
        }
    )


@mcp.tool()
def meritco_universal_search(query: str) -> str:
    """
    在久谦 bot「通用查询」中提交问题，等待页面生成后返回报告正文（纯文本）。

    服务端通过 Playwright 无头浏览器完成，无需调用方自行开浏览器。
    仅参数 query 有效。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_universal_search(q)


@mcp.tool()
def meritco_consumption_scenario_analysis(query: str) -> str:
    """
    久谦菜单：用户 → 消费场景分析（/report/mec）。

    输入品类/品牌/产品或对比表达式，例如：
    - 防晒霜
    - 海底捞
    - 花西子 眉笔
    - 防晒霜 vs 防晒喷雾
    - 火锅: 2022 vs 2023 vs 2024
    - "防晒喷雾"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_consumption_scenario(q)


@mcp.tool()
def meritco_user_satisfaction(query: str) -> str:
    """
    久谦菜单：用户 → 满意度分析（/report/sentiment）。

    基于消费者满意度理论（NPS = 正面观点 − 负面观点），输出品类/品牌/产品的
    正面观点、负面观点与综合满意度。支持单项、对比与对标分析。

    输入示例：
    - 炸鸡 / Manner / 花西子 眉笔
    - 小米SU7 vs 理想MEGA
    - 火锅 vs 海底捞
    - 粉底液：雅诗兰黛 vs 兰蔻
    - 花西子：2022 vs 2023 vs 2024
    - 特斯拉：23Q4 vs 24Q1 vs 24Q2
    - 特斯拉：202312 vs 202406
    - 特斯拉：对标城市线级
    - 小米SU7：对标性别
    - 花西子：对标年龄
    - "蔚来汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_user_satisfaction(q)


@mcp.tool()
def meritco_emotion_analysis(query: str) -> str:
    """
    久谦菜单：用户 → 情绪分析（/report/emotion）。

    针对品类/品牌/产品的用户**情绪**进行洞察：正面/负面/中性情绪占比、情绪标签、
    情感倾向、对比情绪走势等。

    输入示例：
    - 小米SU7 / 花西子 / Manner
    - 花西子 vs 完美日记
    - 蜜雪冰城 vs 茶百道
    - 粉底液：雅诗兰黛 vs 兰蔻
    - 特斯拉：23Q4 vs 24Q1 vs 24Q2
    - 小米SU7：对标性别
    - 花西子：对标年龄
    - "蔚来汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_emotion_analysis(q)


@mcp.tool()
def meritco_market_micro_scene(query: str) -> str:
    """
    久谦菜单：市场 → 微场景（/report/market-micro-scene）。

    针对品类/品牌/产品的**细分消费微场景**进行洞察：场景分布、场景标签、
    场景驱动、典型使用情境、对比微场景走势等。

    输入示例：
    - 小米SU7 / 防晒霜 / Manner
    - 防晒霜 vs 防晒喷雾
    - 蜜雪冰城 vs 茶百道
    - 粉底液：雅诗兰黛 vs 兰蔻
    - 特斯拉：23Q4 vs 24Q1 vs 24Q2
    - 小米SU7：对标性别
    - 花西子：对标年龄
    - "蔚来汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_market_micro_scene(q)


@mcp.tool()
def meritco_product_value_positioning(query: str) -> str:
    """
    久谦菜单：市场 → 产品价值定位（/report/market/productValue）。

    针对品类/品牌/产品的**价值定位**进行洞察：价值主张、功能价值 / 情感价值 /
    象征价值的拆解、与竞品的差异化价值、品类价值排序等。

    输入示例：
    - 小米SU7 / 花西子 / Manner
    - 花西子 vs 完美日记
    - 蜜雪冰城 vs 茶百道
    - 粉底液：雅诗兰黛 vs 兰蔻
    - 特斯拉：23Q4 vs 24Q1 vs 24Q2
    - 小米SU7：对标性别
    - 花西子：对标年龄
    - "蔚来汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_product_value(q)


@mcp.tool()
def meritco_compete_discovery(query: str) -> str:
    """
    久谦菜单：市场 / 数据银行 → 竞品发现与对标（/report/databank/competeV2）。

    针对品牌/产品的**竞品图谱与对标**进行洞察：潜在对标候选、竞争格局、
    品类内排位、对标维度（性别 / 年龄 / 价格段 / 城市线级 / 时间窗）上的差异化对比。

    输入示例：
    - 小米SU7 / 花西子 / Manner
    - 小米SU7 vs 理想MEGA
    - 花西子 vs 完美日记
    - 粉底液：雅诗兰黛 vs 兰蔻
    - 特斯拉：23Q4 vs 24Q1 vs 24Q2
    - 小米SU7：对标性别
    - 花西子：对标年龄
    - "蔚来汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_compete(q)


@mcp.tool()
def meritco_consumer_journey(query: str) -> str:
    """
    久谦菜单：市场 → 消费者旅程（/report/market/journey）。

    针对品牌/产品的**消费者决策旅程**进行洞察：认知 → 兴趣 → 比较 → 购买 →
    使用 → 分享/复购 各阶段拆解、各阶段触点 / 内容 / 渠道 / 关键问题 / 痛点、
    转化漏斗与流失节点。

    输入示例：
    - 小米SU7 / 花西子 / Manner
    - 花西子 vs 完美日记
    - 蜜雪冰城 vs 茶百道
    - 粉底液：雅诗兰黛 vs 兰蔻
    - 特斯拉：23Q4 vs 24Q1 vs 24Q2
    - 小米SU7：对标性别
    - 花西子：对标年龄
    - "蔚来汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_consumer_journey(q)


@mcp.tool()
def meritco_trend_analysis(query: str) -> str:
    """
    久谦菜单：市场 → 流行趋势 / 产品设计趋势（/report/productDesignTrend）。

    针对品类/品牌/产品的**设计趋势**进行洞察：风格 / 配色 / 形态 / 功能 /
    材质 / 工艺 / 包装 / 卖点 等设计要素的演变方向、近期上升 / 下降的趋势项、
    典型设计案例。

    输入示例：
    - 小米SU7 / 花西子 / Manner
    - 花西子 vs 完美日记
    - 蜜雪冰城 vs 茶百道
    - 粉底液：雅诗兰黛 vs 兰蔻
    - 特斯拉：23Q4 vs 24Q1 vs 24Q2
    - 小米SU7：对标性别
    - 花西子：对标年龄
    - "蔚来汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_trend(q)


@mcp.tool()
def meritco_element_analysis(query: str) -> str:
    """
    久谦菜单：市场 → 具体元素分析（/report/productAnalytic）。

    针对品类/品牌/产品的**具体元素**进行逐项拆解：成分 / 卖点 / 特性 /
    关键词 / 标签 / 包装元素 / 配方元素 / 工艺元素 / 功能元素 等，
    以及单元素的提及度、满意度、典型案例、元素之间的关联。

    输入示例：
    - 小米SU7 / 花西子 / Manner
    - 花西子 vs 完美日记
    - 蜜雪冰城 vs 茶百道
    - 粉底液：雅诗兰黛 vs 兰蔻
    - 特斯拉：23Q4 vs 24Q1 vs 24Q2
    - 小米SU7：对标性别
    - 花西子：对标年龄
    - "蔚来汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_element(q)


@mcp.tool()
def meritco_brand_identity(query: str, accountId: str | None = None) -> str:
    """
    久谦菜单：市场 → 品牌主张（/report/identity）。

    ★ 两阶段调用 ★（平台上唯一需要两次调用的报告工具）：

    阶段一  只传 query（品牌名，如 "蜜雪冰城" / "蕉内" / "花西子" / "Manner"）→
            返回该关键词在久谦数据库里匹配到的若干**候选账号** markdown 表（含 accountId、粉丝数、互动量）。
            例如「蜜雪冰城」会命中 蜜雪冰城 / 蜜雪冰城招聘 / 蜜雪冰城广州 / 蜜雪冰城雪王 等多个不同账号。
    阶段二  把 accountId 也传上（如 query="蜜雪冰城", accountId="1997MXBC"）→
            返回该具体账号的**品牌主张完整报告**正文：品牌定位、核心价值、品牌承诺、Slogan、品牌人格、品牌叙事等。

    严禁瞎猜 accountId——必须先调一次拿到候选列表里的真实 ID 再选一个传入。

    返回页面生成后的报告正文（纯文本，markdown）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    aid = (accountId or "").strip() or None
    return _run_node_identity(q, aid)


@mcp.tool()
def meritco_brand_association(query: str) -> str:
    """
    久谦菜单：市场 → 品牌 → 品牌联想（/report/association）。

    聚焦**消费者一提到该品牌 / 品类时脑海里冒出的词**——是品牌心智层的"第一联想"分布：
    联想词、关键词云、消费者第一反应、品类联想、联想词竞争格局、品牌 vs 品牌的联想差异。

    与 `meritco_brand_identity`（两阶段）不同，本工具是**单阶段**调用，
    输入品牌/品类关键词即可在页面右侧直接生成联想词报告。

    输入示例：
    - 蜜雪冰城 / 蕉内 / 花西子 / Manner
    - 奶茶 / 新能源车 / 防晒霜（品类）
    - 花西子 vs 完美日记
    - 蜜雪冰城 vs 茶百道
    - 小米SU7：对标性别
    - "蔚来汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_association(q)


@mcp.tool()
def meritco_brand_archetype(query: str) -> str:
    """
    久谦菜单：市场 → 品牌 → 品牌原型（/report/brandArchetype）。

    基于卡尔·荣格 **12 种品牌原型（Brand Archetype）** 对品牌人格做结构化拆分：
    爱人 Lover / 纯真者 Innocent / 创造者 Creator / 关怀者 Caregiver /
    魔法师 Magician / 探险家 Explorer / 英雄 Hero / 反叛者 Outlaw /
    凡夫俗子 Regular / 统治者 Ruler / 智者 Sage / 开心果 Jester。
    按各原型占比排序输出概述、描述、典型观点、提及品牌、提及产品等字段。

    输入示例：
    - 耐克 / 小米SU7 / 蜜雪冰城 / 蕉内 / 花西子
    - 小米汽车 vs 理想汽车（vs 比较，最多 6 个）
    - 阿迪达斯：2022 vs 2024（对比年份）
    - 特斯拉：23Q4 vs 24Q1 vs 24Q2（对比季度）
    - 特斯拉：202312 vs 202406（对比月份）
    - 特斯拉：对标城市规模 / 小米SU7：对标性别 / 花西子：对标年龄
    - "理想汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本，markdown，每个原型形如 `### [67%] 英雄`）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_archetype(q)


@mcp.tool()
def meritco_brand_personality(query: str) -> str:
    """
    久谦菜单：市场 → 品牌 → 品牌性格（/report/personality）。

    基于 Jennifer Aaker 的 **Brand Personality Big Five** 模型对品牌做结构化拆分：
    真诚 Sincerity / 激情 Excitement / 精致 Sophistication / 可靠 Reliability / 强韧 Ruggedness。
    按各维度占比排序输出概述、描述、典型观点、提及品牌、提及产品等字段。

    输入示例：
    - Manner / 蜜雪冰城 / 耐克 / 蕉内 / 花西子
    - 小米汽车 vs 理想汽车（vs 比较）
    - 阿迪达斯：2022 vs 2024
    - 小米SU7：对标性别 / 花西子：对标年龄
    - "理想汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本，markdown，每个维度形如 `### [NN%] 真诚`）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_personality(q)


@mcp.tool()
def meritco_brand_asset(query: str) -> str:
    """
    久谦菜单：市场 → 品牌 → 品牌资产（/report/brandAsset）。

    聚焦 **Brand Equity / Brand Asset**（Aaker / Keller 经典品牌资产框架）：
    知名度、忠诚度、美誉度、联想度、感知质量、议价权、渠道力 等多维度。
    按各资产维度占比排序输出概述、描述、典型观点、提及品牌、提及产品等字段。

    输入示例：
    - 蜜雪冰城 / 耐克 / 小米SU7 / 蕉内 / 花西子
    - 小米汽车 vs 理想汽车（vs 比较）
    - 阿迪达斯：2022 vs 2024
    - 小米SU7：对标性别 / 花西子：对标年龄
    - "理想汽车"（精准搜索）

    返回页面生成后的报告正文（纯文本，markdown，每个维度形如 `### [NN%] 知名度`）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_brand_asset(q)


@mcp.tool()
def meritco_ip_collaboration(query: str) -> str:
    """
    久谦菜单：营销 → 联名与代言 Beta（/report/ipV2）。

    报告聚焦：品牌的 IP 联名 / 代言人 / 跨界合作资产盘点——联名对象、
    代言人组合、合作品类与频次、典型案例、社媒话题影响等。

    输入示例：
    - 蜜雪冰城 / 耐克 / 瑞幸 / Manner
    - 瑞幸 vs Manner（vs 比较）
    - 耐克：2022 vs 2024
    - 小米SU7：对标性别
    - "理想汽车"（精准搜索）

    Beta 状态，部分关键词可能触发"生成中止"，工具会自动识别并在响应头部加警告。
    返回页面生成后的报告正文（纯文本，markdown）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_ip_collaboration(q)


@mcp.tool()
def meritco_kol_discovery(query: str) -> str:
    """
    久谦菜单：营销 → 达人筛选与生成 Beta（/report/kol）。

    ★ 输入语义特殊 ★：与其它工具不同，本工具的 query 是**达人 ID 或达人昵称**
    （不是品牌名）。报告聚焦：该达人的画像、内容偏好、粉丝结构、商业能力、
    适配品类、历史合作品牌等。

    输入示例：
    - 李佳琦 / 张大奕 / 蜜雪冰城雪王（达人昵称）
    - 1997MXBC / fanxin123 / 3631266488（达人平台 ID）

    如果用户给的是品牌名而不是达人，建议改用 meritco_brand_identity。
    Beta 状态。返回页面生成后的报告正文。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_kol(q)


@mcp.tool()
def meritco_narrative_framework(query: str) -> str:
    """
    久谦菜单：营销 → 叙事架构 Beta（/report/hotpost）。

    报告聚焦：品牌 / 品类的热门内容叙事框架——核心叙事母题、话题切入点、
    热门帖结构（标题→hook→产品→转化）、传播路径、典型 hook 与转折等。

    输入示例：
    - 蜜雪冰城 / 雪王 / 耐克 / 花西子
    - 小米SU7 vs 理想MEGA（vs 比较）
    - 蜜雪冰城：2024 vs 2025
    - "雪王"（精准搜索）

    Beta 状态。返回页面生成后的报告正文。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_narrative(q)


@mcp.tool()
def meritco_topic_traffic(query: str) -> str:
    """
    久谦菜单：营销 → 话题流量 Beta（/report/topic）。

    报告聚焦：品牌 / 品类 / 话题（hashtag）的流量分布——热门话题排行、
    流量趋势、话题关联品牌、话题生命周期、流量 vs 转化效率等。

    输入示例：
    - 蜜雪冰城 / 雪王 / 520 / 情侣证（品牌 / 话题 / hashtag 都行）
    - 蜜雪冰城 vs 茶百道（vs 比较）
    - 雪王：2024 vs 2025
    - 小米SU7：对标性别
    - "理想汽车"（精准搜索）

    Beta 状态。返回页面生成后的报告正文。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_topic(q)


@mcp.tool()
def meritco_marketing_assessment(brand: str, target: str) -> str:
    """
    久谦菜单：营销 → 营销有效性 Beta（/report/assessment）。

    ★ 平台上**唯一**的双参数工具 ★：需要同时传 brand 和 target。
    评估"某品牌 × 某具体营销动作"的有效性——曝光量、互动率、声量趋势、
    用户反馈、ROI 信号、是否破圈等。

    参数：
      brand：品牌名（左输入框）
        - 例：蜜雪冰城 / 瑞幸 / 耐克 / 小米
      target：被评估的营销对象 / 活动 / 事件 / 产品 / IP（右输入框）
        - 例：520情侣证 / 椰云拿铁 / CHBL高中联赛 / SU7发布会 / 雪王

    使用示例：
      meritco_marketing_assessment(brand="蜜雪冰城", target="520情侣证")
      meritco_marketing_assessment(brand="瑞幸", target="椰云拿铁")
      meritco_marketing_assessment(brand="耐克", target="CHBL高中联赛")

    Beta 状态，部分组合可能样本不足触发"生成中止"，工具会自动识别并加警告头。
    返回页面生成后的报告正文（纯文本，markdown）。
    """
    b = (brand or "").strip()
    t = (target or "").strip()
    if not b:
        raise ValueError("brand 不能为空")
    if not t:
        raise ValueError("target 不能为空")
    return _run_node_assessment(b, t)


@mcp.tool()
def meritco_category_dynamics(query: str) -> str:
    """
    久谦菜单：运营 → 品类动态与机会 Beta（/report/databank/cate）。

    报告聚焦：品类整体动态、增长机会、细分赛道、品类天花板与新兴趋势。

    输入示例：
    - 新茶饮 / 新能源车 / 防晒霜 / 水乳套装 / 轻奢羽绒服

    Beta 状态。返回页面生成后的报告正文（纯文本，markdown）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_category(q)


@mcp.tool()
def meritco_brand_performance(query: str) -> str:
    """
    久谦菜单：运营 → 品牌定位与业绩 Beta（/report/databank/brand）。

    报告聚焦：品牌定位（价格带 / 品类站位 / 人群）+ 业绩盘点
    （声量 / 销量 / 增长 / 市场份额 / 复购）。
    与 meritco_brand_* 心智系列相比，本工具更偏生意层面的数据。

    输入示例：
    - 蜜雪冰城 / 小米SU7 / 花西子 / 蕉内 / 耐克

    Beta 状态。返回页面生成后的报告正文（纯文本，markdown）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_brand_performance(q)


@mcp.tool()
def meritco_product_potential(query: str) -> str:
    """
    久谦菜单：运营 → 商品潜力 Beta（/report/databank/spu）。
    'spu' = Standard Product Unit，颗粒度到 SKU/SPU 级。

    报告聚焦：商品的市场潜力、销量预测、定价空间、竞品 SPU 对比、
    同类替代风险与机会窗口。

    输入示例：
    - 防晒喷雾 / 雪王霸气桶 / 小米SU7 Max / Vomero 5

    Beta 状态。返回页面生成后的报告正文（纯文本，markdown）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_product_potential(q)


@mcp.tool()
def meritco_food_hotspot(query: str) -> str:
    """
    久谦菜单：其他 → 餐饮榜单（/report/hotspot）。

    报告聚焦：餐饮品牌 / 菜系 / 城市的热度榜单——粉丝增长、声量、上新、
    热门门店、人气排行等。

    输入示例：
    - 蜜雪冰城 / 海底捞 / 喜茶（餐饮品牌）
    - 火锅 / 烧烤 / 茶饮（菜系/品类）
    - 上海 / 深圳 / 成都（城市）

    注意：此页面具体交互方式『需自行摸索』，如首次调用结果不符合预期，
    建议改用 meritco_universal_search 兜底。
    返回页面生成后的报告正文（纯文本）。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_food_hotspot(q)


@mcp.tool()
def meritco_media_volume(query: str) -> str:
    """
    久谦菜单：其他 → 声量（/report/media_volume）。

    ★ 特殊查询语法 ★：
    - `A`           —— 单关键词常规检索
    - `A  B`（**双空格**）  —— A 和 B 都要命中（AND 关系）
    - `A;;B`（**双分号**） —— A 或 B 任一命中（OR 关系）
    - 可混用：例 `蜜雪冰城  雪王;;茶颜悦色  雪王`

    报告聚焦：关键词在社媒（微博 / 小红书 / 抖音）的声量分布、帖子数、
    互动量、时间趋势。

    输入示例：
    - "蜜雪冰城"
    - "蜜雪冰城  雪王"          ← AND，两个词都要出现
    - "蜜雪冰城;;茶颜悦色"      ← OR，任一即可
    - "蜜雪冰城  雪王;;茶颜悦色  雪王"  ← AND + OR 组合

    返回页面生成后的报告正文（纯文本，markdown）。
    """
    q = query if isinstance(query, str) else ""
    # 注意：不要 .strip() 中间空白，会破坏「双空格 = AND」语义
    q = q.lstrip().rstrip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_media_volume(q)


def _host_port() -> tuple[str, int]:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    return host, port


if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "http").strip().lower()
    host, port = _host_port()

    if transport == "sse":
        mcp.run(transport="sse", host=host, port=port)
    elif transport == "stdio":
        mcp.run(transport="stdio")
    else:
        # 默认 HTTP；端点一般为 http://<host>:<port>/mcp/
        mcp.run(transport="http", host=host, port=port)
