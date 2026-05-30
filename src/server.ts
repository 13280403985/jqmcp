import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { loadMeritcoLocalEnv } from "./loadMeritcoLocalEnv.js";
import { playwrightConfigPathIfExists } from "./httpConfig.js";
import { runMeritcoUniversalPreferred } from "./universalMeritco.js";
import {
  consumptionConfigPathIfExists,
  runConsumptionScenarioAnalysis,
} from "./consumptionScenarioMeritco.js";
import {
  satisfactionConfigPathIfExists,
  runUserSatisfactionAnalysis,
} from "./userSatisfactionMeritco.js";
import {
  emotionConfigPathIfExists,
  runEmotionAnalysis,
} from "./emotionAnalysisMeritco.js";
import {
  marketMicroSceneConfigPathIfExists,
  runMarketMicroSceneAnalysis,
} from "./marketMicroSceneMeritco.js";
import {
  productValueConfigPathIfExists,
  runProductValuePositioning,
} from "./productValueMeritco.js";
import {
  competeConfigPathIfExists,
  runCompeteDiscovery,
} from "./competeMeritco.js";
import {
  consumerJourneyConfigPathIfExists,
  runConsumerJourneyAnalysis,
} from "./consumerJourneyMeritco.js";
import {
  trendConfigPathIfExists,
  runTrendAnalysis,
} from "./trendMeritco.js";
import {
  elementConfigPathIfExists,
  runElementAnalysis,
} from "./elementMeritco.js";
import {
  identityConfigPathIfExists,
  runBrandIdentityAnalysis,
} from "./identityMeritco.js";
import {
  associationConfigPathIfExists,
  runBrandAssociationAnalysis,
} from "./associationMeritco.js";
import {
  archetypeConfigPathIfExists,
  runBrandArchetypeAnalysis,
} from "./archetypeMeritco.js";
import {
  personalityConfigPathIfExists,
  runBrandPersonalityAnalysis,
} from "./personalityMeritco.js";
import {
  brandAssetConfigPathIfExists,
  runBrandAssetAnalysis,
} from "./brandAssetMeritco.js";
import {
  ipCollaborationConfigPathIfExists,
  runIpCollaborationAnalysis,
} from "./ipCollaborationMeritco.js";
import {
  kolConfigPathIfExists,
  runKolAnalysis,
} from "./kolMeritco.js";
import {
  narrativeConfigPathIfExists,
  runNarrativeAnalysis,
} from "./narrativeMeritco.js";
import {
  topicConfigPathIfExists,
  runTopicAnalysis,
} from "./topicMeritco.js";
import {
  assessmentConfigPathIfExists,
  runMarketingAssessmentAnalysis,
} from "./assessmentMeritco.js";
import {
  categoryConfigPathIfExists,
  runCategoryDynamicsAnalysis,
} from "./categoryMeritco.js";
import {
  brandPerformanceConfigPathIfExists,
  runBrandPerformanceAnalysis,
} from "./brandPerformanceMeritco.js";
import {
  productPotentialConfigPathIfExists,
  runProductPotentialAnalysis,
} from "./productPotentialMeritco.js";
import {
  foodHotspotConfigPathIfExists,
  runFoodHotspotAnalysis,
} from "./foodHotspotMeritco.js";
import {
  mediaVolumeConfigPathIfExists,
  runMediaVolumeAnalysis,
} from "./mediaVolumeMeritco.js";

/** 分页与超时（history/get 与 HTTP 模式共用） */
const paginationSchema = {
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("分页页码，替换 meritco.http.json 请求体中的 {{page}}，默认 1"),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("每页条数，替换 {{pageSize}}，默认 10"),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("可选：HTTP 轮询阶段最长等待毫秒数（meritco_history_get）；通用查询 Playwright 忽略"),
};

const conversationSchema = {
  conversationId: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      "请求体 {{conversationId}}（数字）。不传时可用纯数字 query、或环境变量 MERITCO_CONVERSATION_ID（meritco_history_get）",
    ),
  category: z
    .string()
    .optional()
    .describe("请求体 {{category}}；默认 DEEP_RESEARCH_SM；或环境变量 MERITCO_CATEGORY"),
};

/** 在进程启动时校验配置文件，避免首次工具调用才失败 */
function validateStartup(): void {
  if (!playwrightConfigPathIfExists()) {
    console.error(
      "未找到 meritco.playwright.json，通用查询无法运行。请确认根目录存在该文件（可从 config/meritco.playwright.example.json 复制）。",
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  /** 与终端共用 meritco.local.env：MCP 仅配 MERITCO_CONFIG_DIR 即可读取同一份 profile/HTTP 配置 */
  const le = loadMeritcoLocalEnv();
  if (le.loaded && process.env.MERITCO_DEBUG_LOCAL_ENV?.trim() === "1") {
    console.error(`[jqmcp] 本地环境文件 ${le.path}，补全 ${le.keysApplied} 个未预设键`);
  }

  validateStartup();

  // MCP 规范：stdio 传输下勿向 stdout 打印调试信息，仅使用 stderr
  console.error(
    "[jqmcp] 通用查询=Playwright（默认持久化 profile：meritco-chromium-profile，先 npm run meritco:profile 登录一次）",
  );

  const server = new McpServer({
    name: "jqmcp",
    version: "1.0.0",
  });

  server.registerTool(
    "meritco_universal_search",
    {
      description:
        "【何时调用】用户需要在久谦 **bot / 通用查询** 里**提交新问题**并拿到**页面生成后的报告正文**（长文结论，非接口 JSON）时，**优先使用本工具**。\n" +
        "【行为】在 MCP 进程内用 **Playwright** 打开 `meritco.playwright.json` 中的页面：自动输入 `query`、等待结果区稳定，再从 DOM 抽取**正文可见文本**（与页面 innerText 等价的可读纯文本；已按配置收窄到报告区域时，不含侧栏/工具条）。**不是**在 Cursor 里再开一个独立「浏览器工具」——浏览器自动化已封装在本工具内。\n" +
        "【返回】成功时返回一段 **text**：即久谦页面上**生成完成后的正文**；失败时 `isError` 与中文错误说明（常见：未登录、选择器不匹配、超时）。\n" +
        "【参数】仅 **`query`**（用户问题/检索词）生效；`page` / `pageSize` / `timeoutMs` / `conversationId` / `category` 传入也会被忽略（为兼容旧客户端保留）。\n" +
        "【前置】根目录需有 **meritco.playwright.json**（`bodySelector` / 可选 `extractSelector` 等）。通用查询默认走持久化登录态（`meritco-chromium-profile`）：请先执行 `npm run meritco:profile` 完成登录。通用查询默认**无头后台**（不弹浏览器）；需看窗口调试时设 **MERITCO_PLAYWRIGHT_HEADLESS=0**。如必须兼容旧方案，可显式设 `MERITCO_USE_PERSIST_PROFILE=0` 再自行配置 Cookie/Storage。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "在久谦通用查询输入框中提交的用户问题或检索词；本工具会等待页面生成后返回报告正文文本。",
          ),
        ...paginationSchema,
        ...conversationSchema,
      },
    },
    async ({ query, timeoutMs, page, pageSize, conversationId, category }) => {
      try {
        const text = await runMeritcoUniversalPreferred(query, {
          timeoutMs,
          page,
          pageSize,
          conversationId,
          category,
        });
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `久谦通用查询失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 消费场景分析（菜单：用户 > 消费场景分析）。
   * 完全独立于 universal_search：自带配置 meritco.consumption.playwright.json，
   * 共用同一持久化 profile。Agent 想要「品类/品牌/产品/对比」类消费洞察时优先用本工具。
   */
  const mecOk = !!consumptionConfigPathIfExists();
  server.registerTool(
    "meritco_consumption_scenario_analysis",
    {
      description:
        "【何时调用】用户需要在久谦平台「消费场景分析」（菜单：用户 > 消费场景分析，URL 末段 `/report/mec`）里**查品类/品牌/产品**或做**对比分析**（例：`防晒霜`、`海底捞`、`花西子 眉笔`、`防晒霜 vs 防晒喷雾`、`火锅: 2022 vs 2023 vs 2024` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 mec 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本）。\n" +
        "【与 meritco_universal_search 的区别】本工具走的是 `/report/mec`（消费场景分析）页面，**不是** bot 通用查询；返回的是该页生成的结构化报告。需要长文研究 / 一般性问答时请改用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效，按 mec 页输入框规则填写：单关键词、空格分隔的多关键词、`vs` 比较，或精准搜索 `\"防晒喷雾\"`。\n" +
        "【前置】根目录需有 **meritco.consumption.playwright.json**；登录态同 universal_search，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "消费场景分析输入框关键词（品类/品牌/产品/对比表达式等，与 mec 页示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!mecOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_consumption_scenario_analysis 需要项目根目录下的 meritco.consumption.playwright.json（MERITCO_CONSUMPTION_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runConsumptionScenarioAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `消费场景分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 用户满意度分析（菜单：用户 > 满意度分析）。
   * 完全独立于 universal_search / consumption_scenario：自带配置
   * meritco.satisfaction.playwright.json，共用同一持久化 profile。
   * Agent 想要「品类/品牌/产品满意度、NPS、对比满意度」等洞察时优先用本工具。
   */
  const satOk = !!satisfactionConfigPathIfExists();
  server.registerTool(
    "meritco_user_satisfaction",
    {
      description:
        "【何时调用】用户需要在久谦平台「满意度分析」（菜单：用户 > 满意度分析，URL 末段 `/report/sentiment`）里查**品类/品牌/产品的用户满意度**（正面 / 负面观点、净推荐值 NPS），或做对比满意度分析（例：`炸鸡`、`Manner`、`花西子 眉笔`、`小米SU7 vs 理想MEGA`、`粉底液：雅诗兰黛 vs 兰蔻`、`特斯拉：23Q4 vs 24Q1 vs 24Q2`、`小米SU7：对标性别`、`花西子：对标年龄` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 sentiment 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落）。\n" +
        "【与其它工具的区别】本工具走的是 `/report/sentiment`（满意度分析）页面：返回的是基于消费者满意度理论（NPS = 正面观点 − 负面观点）的结构化报告，重点是**满意度 / 不满意度**而非消费场景。需要消费场景洞察请用 `meritco_consumption_scenario_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 sentiment 页输入框规则填写：单关键词（品类/品牌/产品）、`vs` 比较、`品牌：对标维度`（如 `小米SU7：对标性别`）、或精准搜索 `\"蔚来汽车\"`。\n" +
        "【前置】根目录需有 **meritco.satisfaction.playwright.json**；登录态同其它两个工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "满意度分析输入框关键词（品类/品牌/产品/对比/对标维度表达式，与 sentiment 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!satOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_user_satisfaction 需要项目根目录下的 meritco.satisfaction.playwright.json（MERITCO_SATISFACTION_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runUserSatisfactionAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `满意度分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 情绪分析（菜单：用户 > 情绪分析）。
   * 完全独立于 universal_search / consumption_scenario / user_satisfaction：
   * 自带配置 meritco.emotion.playwright.json，共用同一持久化 profile。
   * Agent 想要「品类/品牌/产品的情绪占比、正/负面情绪、对比情绪走势」等洞察时优先用本工具。
   */
  const emoOk = !!emotionConfigPathIfExists();
  server.registerTool(
    "meritco_emotion_analysis",
    {
      description:
        "【何时调用】用户需要在久谦平台「情绪分析」（菜单：用户 > 情绪分析，URL 末段 `/report/emotion`）里查**品类/品牌/产品的用户情绪**（正面/负面/中性情绪占比、情绪标签、情感倾向），或做**对比情绪分析 / 情绪走势**（例：`小米SU7`、`花西子`、`花西子 vs 完美日记`、`蜜雪冰城 vs 茶百道`、`特斯拉：23Q4 vs 24Q1 vs 24Q2`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 emotion 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落）。\n" +
        "【与其它工具的区别】本工具走的是 `/report/emotion`（情绪分析）页面：聚焦**情绪占比 / 情绪标签 / 情感倾向**层面的洞察。需要满意度 / NPS 维度请用 `meritco_user_satisfaction`；需要消费场景洞察请用 `meritco_consumption_scenario_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 emotion 页输入框规则填写：单关键词（品类/品牌/产品）、`vs` 比较、`品牌：对标维度`（如 `小米SU7：对标性别`）、或精准搜索 `\"蔚来汽车\"`。\n" +
        "【前置】根目录需有 **meritco.emotion.playwright.json**；登录态同其它三个工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "情绪分析输入框关键词（品类/品牌/产品/对比/对标维度表达式，与 emotion 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!emoOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_emotion_analysis 需要项目根目录下的 meritco.emotion.playwright.json（MERITCO_EMOTION_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runEmotionAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `情绪分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 微场景（菜单：市场 > 微场景）。
   * 完全独立于其它四个工具：自带配置 meritco.market-micro-scene.playwright.json，
   * 共用同一持久化 profile。Agent 想要「品类/品牌/产品的细分消费微场景、
   * 场景分布 / 场景标签 / 场景驱动」等市场侧场景洞察时优先用本工具。
   */
  const mmsOk = !!marketMicroSceneConfigPathIfExists();
  server.registerTool(
    "meritco_market_micro_scene",
    {
      description:
        "【何时调用】用户需要在久谦平台「微场景」（菜单：市场 > 微场景，URL 末段 `/report/market-micro-scene`）里查**品类/品牌/产品的细分消费微场景**（场景分布、场景标签、场景驱动、典型使用情境等），或做**对比微场景 / 微场景走势**（例：`小米SU7`、`防晒霜`、`防晒霜 vs 防晒喷雾`、`蜜雪冰城 vs 茶百道`、`粉底液：雅诗兰黛 vs 兰蔻`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 market-micro-scene 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落）。\n" +
        "【与其它工具的区别】本工具走的是 `/report/market-micro-scene`（市场 / 微场景）页面：聚焦**消费微场景 / 场景分布 / 场景驱动 / 典型使用情境**层面的市场洞察。需要消费场景总体洞察请用 `meritco_consumption_scenario_analysis`；需要满意度 / NPS 维度请用 `meritco_user_satisfaction`；需要情绪占比 / 情绪标签请用 `meritco_emotion_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 micro-scene 页输入框规则填写：单关键词（品类/品牌/产品）、`vs` 比较、`品牌：对标维度`（如 `小米SU7：对标性别`）、或精准搜索 `\"蔚来汽车\"`。\n" +
        "【前置】根目录需有 **meritco.market-micro-scene.playwright.json**；登录态同其它四个工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "微场景输入框关键词（品类/品牌/产品/对比/对标维度表达式，与 market-micro-scene 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!mmsOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_market_micro_scene 需要项目根目录下的 meritco.market-micro-scene.playwright.json（MERITCO_MARKET_MICRO_SCENE_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runMarketMicroSceneAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `微场景分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 产品价值定位（菜单：市场 > 产品价值定位）。
   * 自带配置 meritco.product-value.playwright.json，共用同一持久化 profile。
   * Agent 想要「品类/品牌/产品的价值主张、功能价值、情感价值、象征价值、差异化定位」
   * 等市场侧价值层面的洞察时优先用本工具。
   */
  const pvOk = !!productValueConfigPathIfExists();
  server.registerTool(
    "meritco_product_value_positioning",
    {
      description:
        "【何时调用】用户需要在久谦平台「产品价值定位」（菜单：市场 > 产品价值定位，URL 末段 `/report/market/productValue`）里查**品类/品牌/产品的价值定位**（价值主张、功能价值 / 情感价值 / 象征价值的拆解、与竞品的差异化价值、品类价值排序等），或做**对比价值定位 / 多维度价值对标**（例：`小米SU7`、`花西子`、`花西子 vs 完美日记`、`蜜雪冰城 vs 茶百道`、`粉底液：雅诗兰黛 vs 兰蔻`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 productValue 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落）。\n" +
        "【与其它工具的区别】本工具走的是 `/report/market/productValue`（市场 / 产品价值定位）页面：聚焦**价值主张 / 功能-情感-象征三层价值 / 差异化定位**层面的市场洞察。需要细分微场景 / 场景驱动请用 `meritco_market_micro_scene`；需要消费场景总体洞察请用 `meritco_consumption_scenario_analysis`；需要满意度 / NPS 维度请用 `meritco_user_satisfaction`；需要情绪占比 / 情绪标签请用 `meritco_emotion_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 productValue 页输入框规则填写：单关键词（品类/品牌/产品）、`vs` 比较、`品牌：对标维度`（如 `小米SU7：对标性别`）、或精准搜索 `\"蔚来汽车\"`。\n" +
        "【前置】根目录需有 **meritco.product-value.playwright.json**；登录态同其它五个工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "产品价值定位输入框关键词（品类/品牌/产品/对比/对标维度表达式，与 productValue 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!pvOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_product_value_positioning 需要项目根目录下的 meritco.product-value.playwright.json（MERITCO_PRODUCT_VALUE_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runProductValuePositioning(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `产品价值定位失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 竞品发现与对标（菜单：市场 / 数据银行 > 竞品发现与对标）。
   * 自带配置 meritco.compete.playwright.json，共用同一持久化 profile。
   * Agent 想要「品牌/产品的竞品图谱、对标候选、竞争格局、差异化对比」
   * 等竞品分析侧的洞察时优先用本工具。
   */
  const cmpOk = !!competeConfigPathIfExists();
  server.registerTool(
    "meritco_compete_discovery",
    {
      description:
        "【何时调用】用户需要在久谦平台「竞品发现与对标」（菜单：市场 / 数据银行 > 竞品发现与对标，URL 末段 `/report/databank/competeV2`）里查**品牌/产品的竞品图谱**（潜在对标候选、竞争格局、品类内排位、对标维度上的差异化对比），或做**主品牌 vs 对标品牌 / 对标维度（性别/年龄/价格段/城市线级/时间窗）拆解**（例：`小米SU7`、`花西子`、`小米SU7 vs 理想MEGA`、`花西子 vs 完美日记`、`粉底液：雅诗兰黛 vs 兰蔻`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 competeV2 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落）。\n" +
        "【与其它工具的区别】本工具走的是 `/report/databank/competeV2`（数据银行 / 竞品发现与对标）页面：聚焦**竞品图谱 / 对标候选 / 竞争格局 / 差异化对比**层面的洞察。需要产品价值主张 / 三层价值拆解请用 `meritco_product_value_positioning`；需要细分微场景 / 场景驱动请用 `meritco_market_micro_scene`；需要消费场景总体洞察请用 `meritco_consumption_scenario_analysis`；需要满意度 / NPS 请用 `meritco_user_satisfaction`；需要情绪占比 / 情绪标签请用 `meritco_emotion_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 competeV2 页输入框规则填写：单关键词（品类/品牌/产品）、`vs` 比较、`品牌：对标维度`（如 `小米SU7：对标性别`）、或精准搜索 `\"蔚来汽车\"`。\n" +
        "【前置】根目录需有 **meritco.compete.playwright.json**；登录态同其它六个工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "竞品发现与对标输入框关键词（品类/品牌/产品/对比/对标维度表达式，与 competeV2 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!cmpOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_compete_discovery 需要项目根目录下的 meritco.compete.playwright.json（MERITCO_COMPETE_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runCompeteDiscovery(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `竞品发现与对标失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 消费者旅程（菜单：市场 > 消费者旅程）。
   * 自带配置 meritco.consumer-journey.playwright.json，共用同一持久化 profile。
   * Agent 想要「品牌/产品的消费者决策旅程、触点、转化漏斗、阶段拆解」等
   * 旅程层面的洞察时优先用本工具。
   */
  const cjOk = !!consumerJourneyConfigPathIfExists();
  server.registerTool(
    "meritco_consumer_journey",
    {
      description:
        "【何时调用】用户需要在久谦平台「消费者旅程」（菜单：市场 > 消费者旅程，URL 末段 `/report/market/journey`）里查**品牌/产品的消费者决策旅程**（认知 → 兴趣 → 比较 → 购买 → 使用 → 分享/复购的阶段拆解、各阶段触点 / 内容 / 渠道 / 关键问题 / 痛点、转化漏斗与流失节点），或做**对比旅程 / 对标维度下的旅程差异**（例：`小米SU7`、`花西子`、`花西子 vs 完美日记`、`蜜雪冰城 vs 茶百道`、`粉底液：雅诗兰黛 vs 兰蔻`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 journey 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落）。\n" +
        "【与其它工具的区别】本工具走的是 `/report/market/journey`（市场 / 消费者旅程）页面：聚焦**决策旅程 / 阶段触点 / 转化漏斗 / 流失节点**层面的洞察。需要竞品图谱 / 对标候选请用 `meritco_compete_discovery`；需要产品价值主张请用 `meritco_product_value_positioning`；需要细分微场景请用 `meritco_market_micro_scene`；需要消费场景总体洞察请用 `meritco_consumption_scenario_analysis`；需要满意度 / NPS 请用 `meritco_user_satisfaction`；需要情绪占比 / 情绪标签请用 `meritco_emotion_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 journey 页输入框规则填写：单关键词（品类/品牌/产品）、`vs` 比较、`品牌：对标维度`（如 `小米SU7：对标性别`）、或精准搜索 `\"蔚来汽车\"`。\n" +
        "【前置】根目录需有 **meritco.consumer-journey.playwright.json**；登录态同其它七个工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "消费者旅程输入框关键词（品类/品牌/产品/对比/对标维度表达式，与 journey 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!cjOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_consumer_journey 需要项目根目录下的 meritco.consumer-journey.playwright.json（MERITCO_JOURNEY_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runConsumerJourneyAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `消费者旅程分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 流行趋势 / 产品设计趋势（菜单：市场 > 流行趋势）。
   * 自带配置 meritco.trend.playwright.json，共用同一持久化 profile。
   * Agent 想要「品类/品牌/产品的流行趋势、产品设计趋势、风格 / 配色 / 形态 /
   * 功能 / 材质 等设计要素的趋势演变」等趋势洞察时优先用本工具。
   */
  const trdOk = !!trendConfigPathIfExists();
  server.registerTool(
    "meritco_trend_analysis",
    {
      description:
        "【何时调用】用户需要在久谦平台「流行趋势 / 产品设计趋势」（菜单：市场 > 流行趋势，URL 末段 `/report/productDesignTrend`）里查**品类/品牌/产品的设计趋势**（风格 / 配色 / 形态 / 功能 / 材质 / 工艺 / 包装 / 卖点等设计要素的演变方向、近期上升 / 下降的趋势项、典型案例），或做**对比趋势 / 对标维度下的趋势差异**（例：`小米SU7`、`花西子`、`花西子 vs 完美日记`、`蜜雪冰城 vs 茶百道`、`粉底液：雅诗兰黛 vs 兰蔻`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 productDesignTrend 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落）。\n" +
        "【与其它工具的区别】本工具走的是 `/report/productDesignTrend`（市场 / 流行趋势）页面：聚焦**产品设计要素的趋势演变 / 上升与下降项 / 典型设计案例**层面的洞察。需要决策旅程 / 阶段触点请用 `meritco_consumer_journey`；需要竞品图谱请用 `meritco_compete_discovery`；需要产品价值主张请用 `meritco_product_value_positioning`；需要细分微场景请用 `meritco_market_micro_scene`；需要消费场景总体洞察请用 `meritco_consumption_scenario_analysis`；需要满意度 / NPS 请用 `meritco_user_satisfaction`；需要情绪占比 / 情绪标签请用 `meritco_emotion_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 productDesignTrend 页输入框规则填写：单关键词（品类/品牌/产品）、`vs` 比较、`品牌：对标维度`（如 `小米SU7：对标性别`）、或精准搜索 `\"蔚来汽车\"`。\n" +
        "【前置】根目录需有 **meritco.trend.playwright.json**；登录态同其它八个工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "流行趋势输入框关键词（品类/品牌/产品/对比/对标维度表达式，与 productDesignTrend 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!trdOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_trend_analysis 需要项目根目录下的 meritco.trend.playwright.json（MERITCO_TREND_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runTrendAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `流行趋势分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 具体元素分析（菜单：市场 > 具体元素分析）。
   * 自带配置 meritco.element.playwright.json，共用同一持久化 profile。
   * Agent 想要「品类/品牌/产品的具体元素（成分 / 卖点 / 特性 / 关键词 / 标签 /
   * 包装元素 / 配方元素）逐项拆解」等元素层洞察时优先用本工具。
   */
  const elmOk = !!elementConfigPathIfExists();
  server.registerTool(
    "meritco_element_analysis",
    {
      description:
        "【何时调用】用户需要在久谦平台「具体元素分析」（菜单：市场 > 具体元素分析，URL 末段 `/report/productAnalytic`）里查**品类/品牌/产品的具体元素**（成分 / 卖点 / 特性 / 关键词 / 标签 / 包装元素 / 配方元素 / 工艺元素 / 功能元素 等逐项拆解 + 单元素的提及度 / 满意度 / 典型案例），或做**对比元素 / 对标维度下的元素差异**（例：`小米SU7`、`花西子`、`花西子 vs 完美日记`、`蜜雪冰城 vs 茶百道`、`粉底液：雅诗兰黛 vs 兰蔻`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 productAnalytic 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落）。\n" +
        "【与其它工具的区别】本工具走的是 `/report/productAnalytic`（市场 / 具体元素分析）页面：聚焦**单个元素的提及度 / 满意度 / 典型案例 / 元素之间的关联**——颗粒度比 `meritco_trend_analysis`（趋势整体）和 `meritco_product_value_positioning`（价值主张）更细。需要趋势演变 / 设计要素趋势请用 `meritco_trend_analysis`；需要价值主张 / 三层价值拆解请用 `meritco_product_value_positioning`；需要决策旅程 / 阶段触点请用 `meritco_consumer_journey`；需要竞品图谱请用 `meritco_compete_discovery`；需要细分微场景请用 `meritco_market_micro_scene`；需要消费场景总体洞察请用 `meritco_consumption_scenario_analysis`；需要满意度 / NPS 请用 `meritco_user_satisfaction`；需要情绪占比 / 情绪标签请用 `meritco_emotion_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 productAnalytic 页输入框规则填写：单关键词（品类/品牌/产品）、`vs` 比较、`品牌：对标维度`（如 `小米SU7：对标性别`）、或精准搜索 `\"蔚来汽车\"`。\n" +
        "【前置】根目录需有 **meritco.element.playwright.json**；登录态同其它九个工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "具体元素分析输入框关键词（品类/品牌/产品/对比/对标维度表达式，与 productAnalytic 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!elmOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_element_analysis 需要项目根目录下的 meritco.element.playwright.json（MERITCO_ELEMENT_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runElementAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `具体元素分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 品牌主张（菜单：市场 > 品牌主张）。
   *
   * 注意：与其它 10 个工具不同，identity 页是 **两阶段交互**：
   *   阶段一  输入 query → 中间出账号联想列表；
   *   阶段二  点中一个账号 → 右侧才生成该账号 / 品牌的品牌主张报告。
   *
   * 因此本工具的对外接口同样是两阶段：
   *   - 只传 query              → 返回 markdown 候选账号表 + 二次调用提示；
   *   - 同时传 query + accountId → 返回该账号的完整品牌主张报告正文。
   */
  const idtOk = !!identityConfigPathIfExists();
  server.registerTool(
    "meritco_brand_identity",
    {
      description:
        "【何时调用】用户需要在久谦平台「品牌主张」（菜单：市场 > 品牌主张，URL 末段 `/report/identity`）里查**某品牌账号的品牌主张 / 品牌定位 / 核心价值 / 品牌承诺 / Slogan / Tagline / 品牌人格 / 品牌调性 / 品牌叙事**（例：`蜜雪冰城`、`蕉内`、`花西子`、`Manner` 等品牌名）时，**优先使用本工具**。\n" +
        "【★ 两阶段调用 ★】本工具是平台上**唯一**需要两次调用的报告工具。第一次只传 `query`，会返回该关键词在久谦数据库里命中的若干**候选账号**（例如「蜜雪冰城」会命中『蜜雪冰城』、『蜜雪冰城招聘』、『蜜雪冰城广州』、『蜜雪冰城雪王』等多个不同账号）。请把候选表展示给用户、由用户挑出他要看的那个账号；**第二次调用时把 `query` 和选定的 `accountId` 一起传入**，才会真正返回该账号的品牌主张完整报告。**严禁**自己瞎猜 accountId——必须先调一次拿到候选列表里的真实 ID。\n" +
        "【行为】Playwright 打开 identity 页 → 输入 `query` 回车 → 等中间联想列表出现 → 解析候选账号。\n" +
        "    • 没传 accountId → 立即返回候选列表（markdown 表格，每行含 `accountId`、粉丝数、互动量）。\n" +
        "    • 传了 accountId → 点击该账号 → 等右侧报告区生成 → 返回 prettify 后的报告正文。\n" +
        "【与其它工具的区别】聚焦**品牌账号侧的『我是谁、我承诺什么、我跟谁说话』**——是品牌资产 / 心智层面的描述。需要产品价值主张 / 三层价值请用 `meritco_product_value_positioning`；需要竞品图谱 / 对标全貌请用 `meritco_compete_discovery`；需要趋势演变 / 设计要素趋势请用 `meritco_trend_analysis`；需要单元素提及度 / 满意度请用 `meritco_element_analysis`；需要决策旅程 / 阶段触点请用 `meritco_consumer_journey`；需要细分微场景请用 `meritco_market_micro_scene`；需要消费场景总体洞察请用 `meritco_consumption_scenario_analysis`；需要满意度 / NPS 请用 `meritco_user_satisfaction`；需要情绪占比 / 情绪标签请用 `meritco_emotion_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】\n" +
        "  - `query`（必填）：品牌关键词，建议直接传**品牌名**（账号联想是按品牌名匹配的）。\n" +
        "  - `accountId`（可选）：第一阶段返回的候选表里的 `accountId`（例如 `1997MXBC`、`fanxin123`、`3631266488`），传入即进入第二阶段拉取该账号的完整品牌主张报告。\n" +
        "【前置】登录态同其它十个工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "品牌关键词（直接写品牌名，identity 页按品牌账号匹配；不支持 vs / 对标维度等组合写法）。",
          ),
        accountId: z
          .string()
          .min(1)
          .optional()
          .describe(
            "第一阶段返回的候选表里的 accountId（如 `1997MXBC`）。不传则只返回候选列表，传入则返回该账号完整报告。",
          ),
      },
    },
    async ({ query, accountId }) => {
      if (!idtOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_brand_identity 不可用：识别不到 dist/identityMeritco.js（先 npm run build）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runBrandIdentityAnalysis(query, { accountId });
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `品牌主张分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 品牌联想（菜单：市场 > 品牌 > 品牌联想）。
   * 自带配置 meritco.association.playwright.json，共用同一持久化 profile。
   * Agent 想要「某品牌 / 某品类的联想词分布、关键词云、消费者第一反应、品类联想、
   * 联想词竞争格局」等品牌心智第一联想层洞察时优先用本工具。
   */
  const asnOk = !!associationConfigPathIfExists();
  server.registerTool(
    "meritco_brand_association",
    {
      description:
        "【何时调用】用户需要在久谦平台「品牌联想」（菜单：市场 > 品牌 > 品牌联想，URL 末段 `/report/association`）里查**某品牌 / 某品类的联想词分布 / 关键词云 / 心智第一反应 / 品类联想 / 联想词竞争格局**，或做**品牌 vs 品牌的联想差异 / 品类内多品牌联想对标**（例：`蜜雪冰城`、`蕉内`、`花西子`、`花西子 vs 完美日记`、`新能源车：理想 vs 蔚来`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 association 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落）。本工具是**单阶段**调用（同前 10 个工具），不像 `meritco_brand_identity` 需要先拿 accountId。\n" +
        "【与其它工具的区别】本工具走的是 `/report/association`（市场 / 品牌 / 品牌联想）页面：聚焦**消费者一提到该品牌 / 品类时脑海里冒出的词**——是品牌心智层的「第一联想」分布。需要品牌主张 / 定位 / 承诺 / Slogan / 品牌叙事请用 `meritco_brand_identity`（两阶段）；需要产品价值主张 / 三层价值请用 `meritco_product_value_positioning`；需要竞品图谱 / 对标全貌请用 `meritco_compete_discovery`；需要趋势演变 / 设计要素趋势请用 `meritco_trend_analysis`；需要单元素提及度 / 满意度请用 `meritco_element_analysis`；需要决策旅程 / 阶段触点请用 `meritco_consumer_journey`；需要细分微场景请用 `meritco_market_micro_scene`；需要消费场景总体洞察请用 `meritco_consumption_scenario_analysis`；需要满意度 / NPS 请用 `meritco_user_satisfaction`；需要情绪占比 / 情绪标签请用 `meritco_emotion_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 association 页输入框规则填写：单品牌（如 `蜜雪冰城`、`蕉内`）、单品类（如 `奶茶`、`新能源车`）、`vs` 比较（如 `花西子 vs 完美日记`）、`品类：多品牌` 组合，或精准搜索 `\"蔚来汽车\"`。\n" +
        "【前置】根目录需有 **meritco.association.playwright.json**；登录态同其它工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "品牌联想输入框关键词（品类/品牌/产品/对比/对标维度表达式，与 association 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!asnOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_brand_association 需要项目根目录下的 meritco.association.playwright.json（MERITCO_ASSOCIATION_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runBrandAssociationAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `品牌联想分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 品牌原型（菜单：市场 > 品牌 > 品牌原型）。
   * 自带配置 meritco.archetype.playwright.json，共用同一持久化 profile。
   *
   * 报告基于卡尔·荣格 12 种品牌原型（爱人/纯真者/创造者/关怀者/魔法师/探险家/
   * 英雄/反叛者/凡夫俗子/统治者/智者/开心果）对品牌人格进行结构化拆分，按各原型占比
   * 排序输出概述、描述、典型观点、提及品牌、提及产品等字段。
   */
  const arcOk = !!archetypeConfigPathIfExists();
  server.registerTool(
    "meritco_brand_archetype",
    {
      description:
        "【何时调用】用户需要在久谦平台「品牌原型」（菜单：市场 > 品牌 > 品牌原型，URL 末段 `/report/brandArchetype`）里查**某品牌 / 某品类的 12 种品牌原型（Brand Archetype）占比与典型证据**——爱人 Lover / 纯真者 Innocent / 创造者 Creator / 关怀者 Caregiver / 魔法师 Magician / 探险家 Explorer / 英雄 Hero / 反叛者 Outlaw / 凡夫俗子 Regular / 统治者 Ruler / 智者 Sage / 开心果 Jester；以及**品牌 vs 品牌 / 同品牌不同年份/季度/月份/城市规模/性别/年龄段的原型变迁**（例：`耐克`、`小米SU7`、`小米汽车 vs 理想汽车`、`阿迪达斯：2022 vs 2024`、`特斯拉：23Q4 vs 24Q1 vs 24Q2`、`小米SU7：对标性别`、`花西子：对标年龄` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 brandArchetype 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落，每个原型形如 `### [67%] 英雄` 三级标题 + 概述 + 描述 + 观点 + 提及品牌 + 提及产品）。本工具是**单阶段**调用（同前 10 个工具），不像 `meritco_brand_identity` 需要先拿 accountId。\n" +
        "【与其它工具的区别】本工具走的是 `/report/brandArchetype`（市场 / 品牌 / 品牌原型）页面：聚焦**心理学原型框架下的品牌人格**——是 Carl Jung 12 原型框架的应用，比 `meritco_brand_identity`（品牌主张 / 定位 / Slogan / 叙事，两阶段）更结构化、更心理学；比 `meritco_brand_association`（联想词分布 / 关键词云）更聚焦在『品牌作为一种人格类型的占比』。需要品牌主张 / 定位 / 承诺 / Slogan / 品牌叙事请用 `meritco_brand_identity`（两阶段）；需要联想词分布 / 心智第一反应请用 `meritco_brand_association`；需要产品价值主张 / 三层价值请用 `meritco_product_value_positioning`；需要竞品图谱 / 对标全貌请用 `meritco_compete_discovery`；需要趋势演变 / 设计要素趋势请用 `meritco_trend_analysis`；需要单元素提及度 / 满意度请用 `meritco_element_analysis`；需要决策旅程 / 阶段触点请用 `meritco_consumer_journey`；需要细分微场景请用 `meritco_market_micro_scene`；需要消费场景总体洞察请用 `meritco_consumption_scenario_analysis`；需要满意度 / NPS 请用 `meritco_user_satisfaction`；需要情绪占比 / 情绪标签请用 `meritco_emotion_analysis`；需要 bot 长文研究 / 一般性问答请用 `meritco_universal_search`。\n" +
        "【参数】仅 `query` 生效。按 brandArchetype 页输入框规则填写：单品牌（如 `耐克`、`蜜雪冰城`、`小米SU7`）、`vs` 比较（如 `小米汽车 vs 理想汽车`，最多 6 个）、`品牌：年份/季度/月份/城市规模/性别/年龄` 对标维度（如 `阿迪达斯：2022 vs 2024`、`特斯拉：23Q4 vs 24Q1`、`小米SU7：对标性别`、`花西子：对标年龄`），或精准搜索 `\"理想汽车\"`。\n" +
        "【前置】根目录需有 **meritco.archetype.playwright.json**；登录态同其它工具，默认走持久化 profile（先 `npm run meritco:profile` 登录一次）。默认无头后台运行，不弹浏览器。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "品牌原型输入框关键词（品牌 / vs 比较 / 对标维度表达式，与 brandArchetype 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!arcOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_brand_archetype 需要项目根目录下的 meritco.archetype.playwright.json（MERITCO_ARCHETYPE_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runBrandArchetypeAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `品牌原型分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 品牌性格（菜单：市场 > 品牌 > 品牌性格）。
   * 自带配置 meritco.personality.playwright.json，共用同一持久化 profile。
   *
   * 报告基于品牌个性"大五"理论（Brand Personality Big Five）：真诚 Sincerity /
   * 激情 Excitement / 精致 Sophistication / 可靠 Reliability / 强韧 Ruggedness，
   * 按各维度占比排序输出概述、描述、典型观点、提及品牌、提及产品。
   */
  const perOk = !!personalityConfigPathIfExists();
  server.registerTool(
    "meritco_brand_personality",
    {
      description:
        "【何时调用】用户需要在久谦平台「品牌性格」（菜单：市场 > 品牌 > 品牌性格，URL 末段 `/report/personality`）里查**某品牌 / 某品类的 5 种品牌个性维度（Brand Personality Big Five）占比与典型证据**——真诚 Sincerity / 激情 Excitement / 精致 Sophistication / 可靠 Reliability / 强韧 Ruggedness；以及**品牌 vs 品牌的性格差异 / 同品牌不同年份/季度/月份/性别/年龄段的性格变迁**（例：`Manner`、`蜜雪冰城`、`耐克`、`花西子 vs 完美日记`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 personality 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落，每个性格维度形如 `### [NN%] 真诚` 三级标题 + 概述 + 描述 + 观点 + 提及品牌 + 提及产品）。本工具是**单阶段**调用。\n" +
        "【与其它工具的区别】本工具走的是 `/report/personality`（市场 / 品牌 / 品牌性格）页面：聚焦**品牌作为一种人格类型的 5 维占比**（基于 Jennifer Aaker 的 Brand Personality Big Five 模型）。需要荣格 12 原型框架请用 `meritco_brand_archetype`；需要品牌主张 / 定位 / Slogan / 叙事请用 `meritco_brand_identity`（两阶段）；需要联想词分布 / 心智第一反应请用 `meritco_brand_association`；需要产品价值主张 / 三层价值请用 `meritco_product_value_positioning`；需要竞品图谱 / 对标全貌请用 `meritco_compete_discovery`；其它工具不再赘述。\n" +
        "【参数】仅 `query` 生效。按 personality 页输入框规则填写：单品牌（如 `Manner`、`蜜雪冰城`）、`vs` 比较、`品牌：对标维度` 或精准搜索 `\"理想汽车\"`。\n" +
        "【前置】根目录需有 **meritco.personality.playwright.json**；登录态同其它工具，默认走持久化 profile。默认无头后台运行。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "品牌性格输入框关键词（品牌 / vs 比较 / 对标维度表达式，与 personality 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!perOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_brand_personality 需要项目根目录下的 meritco.personality.playwright.json（MERITCO_PERSONALITY_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runBrandPersonalityAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `品牌性格分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 品牌资产（菜单：市场 > 品牌 > 品牌资产）。
   * 自带配置 meritco.brand-asset.playwright.json，共用同一持久化 profile。
   *
   * 报告聚焦 Brand Equity / Brand Asset 视角：品牌资产维度（知名度 / 忠诚度 /
   * 美誉度 / 联想度 / 感知质量 / 议价权 / 渠道力 等）按各维度占比与典型证据输出。
   */
  const astOk = !!brandAssetConfigPathIfExists();
  server.registerTool(
    "meritco_brand_asset",
    {
      description:
        "【何时调用】用户需要在久谦平台「品牌资产」（菜单：市场 > 品牌 > 品牌资产，URL 末段 `/report/brandAsset`）里查**某品牌 / 某品类的品牌资产维度（Brand Equity / Brand Asset）占比与典型证据**——知名度 / 忠诚度 / 美誉度 / 联想度 / 感知质量 / 议价权 / 渠道力 等；以及**品牌 vs 品牌的资产差异 / 同品牌不同时间段或对标维度的资产变迁**（例：`蜜雪冰城`、`耐克`、`小米汽车 vs 理想汽车`、`花西子：对标年龄` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 brandAsset 页 → 在唯一输入框内输入 `query` → 回车提交 → 等待页面右侧报告区生成并稳定 → 返回**可见正文**（纯文本，已 prettify 成结构化段落，每个资产维度形如 `### [NN%] 知名度` 三级标题 + 概述 + 描述 + 观点 + 提及品牌 + 提及产品）。本工具是**单阶段**调用。\n" +
        "【与其它工具的区别】本工具走的是 `/report/brandAsset`（市场 / 品牌 / 品牌资产）页面：聚焦**品牌作为可衡量资产的多维度账本**（Aaker / Keller 的 Brand Equity 经典框架）。需要荣格 12 原型请用 `meritco_brand_archetype`；需要『大五』个性维度请用 `meritco_brand_personality`；需要品牌主张 / 定位 / Slogan / 叙事请用 `meritco_brand_identity`（两阶段）；需要联想词分布 / 心智第一反应请用 `meritco_brand_association`；需要产品价值主张 / 三层价值请用 `meritco_product_value_positioning`；其它工具不再赘述。\n" +
        "【参数】仅 `query` 生效。按 brandAsset 页输入框规则填写：单品牌（如 `蜜雪冰城`、`耐克`、`小米SU7`）、`vs` 比较、`品牌：对标维度` 或精准搜索 `\"理想汽车\"`。\n" +
        "【前置】根目录需有 **meritco.brand-asset.playwright.json**；登录态同其它工具，默认走持久化 profile。默认无头后台运行。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "品牌资产输入框关键词（品牌 / vs 比较 / 对标维度表达式，与 brandAsset 页搜索方式示例一致）。",
          ),
      },
    },
    async ({ query }) => {
      if (!astOk) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "meritco_brand_asset 需要项目根目录下的 meritco.brand-asset.playwright.json（MERITCO_BRAND_ASSET_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runBrandAssetAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `品牌资产分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 联名与代言（菜单：营销 > 联名与代言 Beta，URL 末段 `/report/ipV2`）。
   * 报告聚焦：品牌的 IP 联名 / 代言人 / 跨界合作资产盘点。
   */
  const ipcOk = !!ipCollaborationConfigPathIfExists();
  server.registerTool(
    "meritco_ip_collaboration",
    {
      description:
        "【何时调用】用户需要在久谦平台「联名与代言」（菜单：营销 > 联名与代言 Beta，URL 末段 `/report/ipV2`）里查**某品牌 / 某品类的 IP 联名 / 代言人 / 跨界合作资产盘点**——联名对象、代言人组合、合作品类与频次、典型案例、社媒话题影响等；或做**品牌 vs 品牌的联名差异 / 同品牌不同时间段的联名变迁**（例：`蜜雪冰城`、`瑞幸 vs Manner`、`耐克：2022 vs 2024` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 ipV2 页 → 输入框输入 `query` → 回车提交 → 等待报告生成稳定 → 返回正文。单阶段调用。\n" +
        "【与其它工具的区别】本工具走 `/report/ipV2`，**专门聚焦『谁联名了谁 / 谁代言了什么』的关系图谱**。需要叙事框架请用 `meritco_narrative_framework`；需要话题流量分布请用 `meritco_topic_traffic`；需要达人画像请用 `meritco_kol_discovery`；需要品牌主张 / 原型 / 性格 / 资产 / 联想分别用对应的 `meritco_brand_*`。\n" +
        "【参数】仅 `query` 生效。按 ipV2 页输入框规则填写：单品牌 / `vs` 比较 / `品牌：对标维度` 或精准搜索。\n" +
        "【前置】**Beta 状态，部分关键词可能触发『生成中止』**，工具会把中止状态识别为警告头返回。",
      inputSchema: {
        query: z.string().min(1).describe("联名与代言输入框关键词（品牌 / vs 比较 / 对标维度）。"),
      },
    },
    async ({ query }) => {
      if (!ipcOk) {
        return {
          content: [{ type: "text" as const, text: "meritco_ip_collaboration 需要项目根目录下的 meritco.ip-collaboration.playwright.json。" }],
          isError: true,
        };
      }
      try {
        const text = await runIpCollaborationAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `联名与代言分析失败：${message}` }], isError: true };
      }
    },
  );

  /**
   * 达人筛选与生成（菜单：营销 > 达人筛选与生成 Beta，URL 末段 `/report/kol`）。
   * 注意：输入是**达人 ID 或达人昵称**（不是品牌名）。
   */
  const kolOk = !!kolConfigPathIfExists();
  server.registerTool(
    "meritco_kol_discovery",
    {
      description:
        "【何时调用】用户需要在久谦平台「达人筛选与生成」（菜单：营销 > 达人筛选与生成 Beta，URL 末段 `/report/kol`）里查**某达人的画像 / 内容偏好 / 粉丝结构 / 商业能力 / 适配品类 / 历史合作品牌**时，**优先使用本工具**。\n" +
        "【★ 输入语义 ★】与其它 14 个工具不同，本工具的 `query` 是**达人 ID 或达人昵称**（例：`李佳琦`、`1997MXBC`、`fanxin123`），不是品牌名。如果用户给的是品牌名，建议改用 `meritco_brand_identity`（按品牌账号查报告）。\n" +
        "【行为】Playwright 打开 kol 页 → 输入框输入达人 ID/名称 → 回车提交 → 等待生成 → 返回正文。单阶段调用。\n" +
        "【与其它工具的区别】唯一一个『**按达人**而非按品牌』检索的工具。需要从品牌反推合作过的达人，用 `meritco_ip_collaboration`；需要看达人活跃的话题流量，用 `meritco_topic_traffic`。\n" +
        "【参数】仅 `query` 生效。建议传**达人昵称**（中英文皆可）或**达人平台 ID**（如小红书 ID）。\n" +
        "【前置】Beta 状态。",
      inputSchema: {
        query: z.string().min(1).describe("达人 ID 或达人昵称（不是品牌名）。例：`李佳琦`、`1997MXBC`、`fanxin123`。"),
      },
    },
    async ({ query }) => {
      if (!kolOk) {
        return {
          content: [{ type: "text" as const, text: "meritco_kol_discovery 需要项目根目录下的 meritco.kol.playwright.json。" }],
          isError: true,
        };
      }
      try {
        const text = await runKolAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `达人筛选分析失败：${message}` }], isError: true };
      }
    },
  );

  /**
   * 叙事架构（菜单：营销 > 叙事架构 Beta，URL 末段 `/report/hotpost`）。
   * 报告聚焦：品牌 / 品类的热门内容叙事框架。
   */
  const nrfOk = !!narrativeConfigPathIfExists();
  server.registerTool(
    "meritco_narrative_framework",
    {
      description:
        "【何时调用】用户需要在久谦平台「叙事架构」（菜单：营销 > 叙事架构 Beta，URL 末段 `/report/hotpost`）里查**某品牌 / 某品类的热门内容叙事框架**——核心叙事母题、话题切入点、热门帖结构（标题→hook→产品→转化）、传播路径、典型 hook 与转折，或做**品牌 vs 品牌的叙事差异**（例：`蜜雪冰城`、`雪王`、`小米SU7 vs 理想MEGA` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 hotpost 页 → 输入 `query` → 回车 → 等待 → 返回正文。单阶段调用。\n" +
        "【与其它工具的区别】本工具走 `/report/hotpost`，**专注内容创作侧『热门帖背后的叙事结构』**。需要话题 / hashtag 流量分布请用 `meritco_topic_traffic`；需要联名/代言资产请用 `meritco_ip_collaboration`；需要达人画像请用 `meritco_kol_discovery`。\n" +
        "【参数】仅 `query` 生效。单品牌 / 品类 / `vs` 比较等。\n" +
        "【前置】Beta 状态。",
      inputSchema: {
        query: z.string().min(1).describe("叙事架构输入框关键词（品牌 / 品类 / vs 比较）。"),
      },
    },
    async ({ query }) => {
      if (!nrfOk) {
        return {
          content: [{ type: "text" as const, text: "meritco_narrative_framework 需要项目根目录下的 meritco.narrative.playwright.json。" }],
          isError: true,
        };
      }
      try {
        const text = await runNarrativeAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `叙事架构分析失败：${message}` }], isError: true };
      }
    },
  );

  /**
   * 话题流量（菜单：营销 > 话题流量 Beta，URL 末段 `/report/topic`）。
   * 报告聚焦：品牌 / 品类的话题 / hashtag 流量分布。
   */
  const tpcOk = !!topicConfigPathIfExists();
  server.registerTool(
    "meritco_topic_traffic",
    {
      description:
        "【何时调用】用户需要在久谦平台「话题流量」（菜单：营销 > 话题流量 Beta，URL 末段 `/report/topic`）里查**某品牌 / 某品类 / 某话题（hashtag）的流量分布**——热门话题排行、流量趋势、话题关联品牌、话题生命周期、流量 vs 转化效率，或做**品牌 vs 品牌的话题竞争 / 同话题在不同时间段的流量变迁**（例：`蜜雪冰城`、`雪王`、`520`、`小米SU7：对标性别` 等）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 topic 页 → 输入 `query` → 回车 → 等待 → 返回正文。单阶段调用。\n" +
        "【与其它工具的区别】本工具走 `/report/topic`，**专注话题 / hashtag 层面的流量量化**。需要叙事结构请用 `meritco_narrative_framework`；需要联名/代言资产请用 `meritco_ip_collaboration`；需要品牌联想词分布请用 `meritco_brand_association`。\n" +
        "【参数】仅 `query` 生效。可以是品牌名、品类名、话题标签（如 `520`、`雪王`）、`vs` 比较等。\n" +
        "【前置】Beta 状态。",
      inputSchema: {
        query: z.string().min(1).describe("话题流量输入框关键词（品牌 / 品类 / 话题 / hashtag / vs 比较）。"),
      },
    },
    async ({ query }) => {
      if (!tpcOk) {
        return {
          content: [{ type: "text" as const, text: "meritco_topic_traffic 需要项目根目录下的 meritco.topic.playwright.json。" }],
          isError: true,
        };
      }
      try {
        const text = await runTopicAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `话题流量分析失败：${message}` }], isError: true };
      }
    },
  );

  /**
   * 营销有效性（菜单：营销 > 营销有效性 Beta，URL 末段 `/report/assessment`）。
   *
   * 注意：与其它 18 个工具不同，本工具有**两个**输入框：
   *   - 左框「请输入品牌」 → 参数 `brand`
   *   - 右框「请输入对象」 → 参数 `target`（被分析的营销活动 / 事件 / 产品 / IP）
   * 两个都填上后回车一起提交，右侧才会生成评估报告。
   */
  const mkaOk = !!assessmentConfigPathIfExists();
  server.registerTool(
    "meritco_marketing_assessment",
    {
      description:
        "【何时调用】用户需要在久谦平台「营销有效性」（菜单：营销 > 营销有效性 Beta，URL 末段 `/report/assessment`）里评估**某个品牌的某个具体营销活动 / 事件 / 产品 / IP 的有效性**——曝光量、互动率、声量趋势、用户反馈、ROI 信号、是否破圈等。例：`蜜雪冰城` + `520情侣证` / `瑞幸` + `椰云拿铁` / `耐克` + `CHBL高中联赛` / `小米` + `SU7发布会`，**优先使用本工具**。\n" +
        "【★ 双输入框 ★】本工具是平台上**唯一**需要两个参数的工具：`brand`（品牌）和 `target`（被评估的营销对象 / 活动 / 事件 / 产品 / IP）。两者都必填。不要把它们合并成一个参数。\n" +
        "【行为】Playwright 打开 assessment 页 → 左输入框填 `brand` → 右输入框填 `target` → 回车一起提交 → 等待报告生成稳定 → 返回 prettify 后的正文。\n" +
        "【与其它工具的区别】本工具走 `/report/assessment`，**专门用于评估『某品牌 × 某具体营销动作』的实际效果**。需要品牌整体的资产 / 主张 / 联想 / 原型 / 性格请用 `meritco_brand_*`；需要爆文叙事框架请用 `meritco_narrative_framework`；需要话题流量分布请用 `meritco_topic_traffic`；需要联名/代言资产盘点请用 `meritco_ip_collaboration`。\n" +
        "【参数】两个都必填：\n" +
        "  - `brand`：品牌名（如 `蜜雪冰城`、`瑞幸`、`耐克`）\n" +
        "  - `target`：被评估的营销对象/活动/事件/产品/IP（如 `520情侣证`、`椰云拿铁`、`CHBL高中联赛`、`SU7发布会`、`雪王`）\n" +
        "【前置】Beta 状态，部分组合可能样本不足触发『生成中止』，工具会自动识别并在响应头部加警告。",
      inputSchema: {
        brand: z
          .string()
          .min(1)
          .describe("品牌名（左输入框）。例：`蜜雪冰城`、`瑞幸`、`耐克`。"),
        target: z
          .string()
          .min(1)
          .describe(
            "被评估的营销对象 / 活动 / 事件 / 产品 / IP（右输入框）。例：`520情侣证`、`椰云拿铁`、`CHBL高中联赛`、`SU7发布会`、`雪王`。",
          ),
      },
    },
    async ({ brand, target }) => {
      if (!mkaOk) {
        return {
          content: [
            {
              type: "text" as const,
              text: "meritco_marketing_assessment 不可用：识别不到 dist/assessmentMeritco.js（先 npm run build）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await runMarketingAssessmentAnalysis({ brand, target });
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `营销有效性分析失败：${message}` }],
          isError: true,
        };
      }
    },
  );

  /**
   * 品类动态与机会（菜单：运营 > 品类动态与机会 Beta，URL 末段 `/report/databank/cate`）。
   * 报告聚焦：品类整体动态、增长机会、细分赛道、品类天花板与新兴趋势。
   */
  const catOk = !!categoryConfigPathIfExists();
  server.registerTool(
    "meritco_category_dynamics",
    {
      description:
        "【何时调用】用户需要在久谦平台「品类动态与机会」（菜单：运营 > 品类动态与机会 Beta，URL 末段 `/report/databank/cate`）里查**某品类的整体动态 / 增长机会 / 细分赛道 / 天花板 / 新兴趋势**（例：`新茶饮`、`新能源车`、`防晒霜`、`轻奢羽绒服`）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 databank/cate 页 → 输入 `query` → 回车 → 等待报告稳定 → 返回正文。单阶段调用。\n" +
        "【与其它工具的区别】本工具走 `/report/databank/cate`，**以品类为单位**做 databank 视角的盘点。需要单个品牌的定位/业绩用 `meritco_brand_performance`；需要单个商品/SPU 的潜力用 `meritco_product_potential`；需要消费场景洞察用 `meritco_consumption_scenario_analysis`；需要竞品图谱用 `meritco_compete_discovery`。\n" +
        "【参数】仅 `query` 生效。建议传**品类名**（粗到细都行：『美妆』、『粉底液』、『水乳套装』）。\n" +
        "【前置】Beta 状态。",
      inputSchema: {
        query: z.string().min(1).describe("品类关键词（粗到细的品类名都可，如 `新茶饮`、`新能源车`、`防晒霜`）。"),
      },
    },
    async ({ query }) => {
      if (!catOk) {
        return { content: [{ type: "text" as const, text: "meritco_category_dynamics 需要 meritco.category.playwright.json。" }], isError: true };
      }
      try {
        const text = await runCategoryDynamicsAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `品类动态与机会分析失败：${message}` }], isError: true };
      }
    },
  );

  /**
   * 品牌定位与业绩（菜单：运营 > 品牌定位与业绩 Beta，URL 末段 `/report/databank/brand`）。
   */
  const bpfOk = !!brandPerformanceConfigPathIfExists();
  server.registerTool(
    "meritco_brand_performance",
    {
      description:
        "【何时调用】用户需要在久谦平台「品牌定位与业绩」（菜单：运营 > 品牌定位与业绩 Beta，URL 末段 `/report/databank/brand`）里查**某品牌的定位（价格带 / 品类站位 / 人群）+ 业绩盘点（声量 / 销量 / 增长 / 市场份额 / 复购）**（例：`蜜雪冰城`、`小米SU7`、`花西子`）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 databank/brand 页 → 输入 `query` → 回车 → 等待报告稳定 → 返回正文。单阶段调用。\n" +
        "【与其它工具的区别】本工具走 `/report/databank/brand`，**以品牌为单位**做 databank 视角的『定位 + 业绩』双重盘点。与 `meritco_brand_*` 系列（品牌主张/联想/原型/性格/资产）相比，本工具更偏**生意层面的数据**（销量、份额、价格带），不是品牌心智。\n" +
        "【参数】仅 `query` 生效。建议传**品牌名**。\n" +
        "【前置】Beta 状态。",
      inputSchema: {
        query: z.string().min(1).describe("品牌关键词（如 `蜜雪冰城`、`小米SU7`、`花西子`）。"),
      },
    },
    async ({ query }) => {
      if (!bpfOk) {
        return { content: [{ type: "text" as const, text: "meritco_brand_performance 需要 meritco.brand-performance.playwright.json。" }], isError: true };
      }
      try {
        const text = await runBrandPerformanceAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `品牌定位与业绩分析失败：${message}` }], isError: true };
      }
    },
  );

  /**
   * 商品潜力（菜单：运营 > 商品潜力 Beta，URL 末段 `/report/databank/spu`）。
   */
  const spuOk = !!productPotentialConfigPathIfExists();
  server.registerTool(
    "meritco_product_potential",
    {
      description:
        "【何时调用】用户需要在久谦平台「商品潜力」（菜单：运营 > 商品潜力 Beta，URL 末段 `/report/databank/spu`，'spu' = Standard Product Unit）里查**某具体商品 / SPU / SKU 的市场潜力 / 销量预测 / 定价空间 / 竞品 SPU 对比 / 同类替代风险**（例：`防晒喷雾`、`雪王霸气桶`、`小米SU7 Max`）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 databank/spu 页 → 输入 `query` → 回车 → 等待报告稳定 → 返回正文。单阶段调用。\n" +
        "【与其它工具的区别】本工具走 `/report/databank/spu`，**颗粒度到 SKU/SPU**。比 `meritco_brand_performance`（品牌级业绩）更细；比 `meritco_category_dynamics`（品类整体）更具体。\n" +
        "【参数】仅 `query` 生效。建议传**具体商品名 / SPU**。\n" +
        "【前置】Beta 状态。",
      inputSchema: {
        query: z.string().min(1).describe("商品 / SPU 关键词（如 `防晒喷雾`、`雪王霸气桶`、`小米SU7 Max`）。"),
      },
    },
    async ({ query }) => {
      if (!spuOk) {
        return { content: [{ type: "text" as const, text: "meritco_product_potential 需要 meritco.product-potential.playwright.json。" }], isError: true };
      }
      try {
        const text = await runProductPotentialAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `商品潜力分析失败：${message}` }], isError: true };
      }
    },
  );

  /**
   * 餐饮榜单（菜单：其他 > 餐饮榜单，URL 末段 `/report/hotspot`）。
   * 用户标记『自己摸索』——具体输入语义实测确认。
   */
  const fhsOk = !!foodHotspotConfigPathIfExists();
  server.registerTool(
    "meritco_food_hotspot",
    {
      description:
        "【何时调用】用户需要在久谦平台「餐饮榜单」（菜单：其他 > 餐饮榜单，URL 末段 `/report/hotspot`）里查**餐饮品牌 / 菜系 / 城市的热度榜单**——粉丝增长、声量、上新、热门门店、人气排行等（例：`蜜雪冰城`、`火锅`、`上海`）时，**优先使用本工具**。\n" +
        "【行为】Playwright 打开 hotspot 页 → 输入 `query` → 回车 → 等待报告稳定 → 返回正文。单阶段调用。\n" +
        "【与其它工具的区别】本工具走 `/report/hotspot`，**专注餐饮垂直行业的榜单类数据**。\n" +
        "【参数】仅 `query` 生效。可传餐饮品牌名 / 菜系 / 城市等。\n" +
        "【前置】注意：此页面具体交互方式『需自行摸索』，如果首次调用结果不符合预期，建议改用 `meritco_universal_search` 兜底。",
      inputSchema: {
        query: z.string().min(1).describe("餐饮榜单查询关键词（品牌 / 菜系 / 城市，如 `蜜雪冰城`、`火锅`、`上海`）。"),
      },
    },
    async ({ query }) => {
      if (!fhsOk) {
        return { content: [{ type: "text" as const, text: "meritco_food_hotspot 需要 meritco.food-hotspot.playwright.json。" }], isError: true };
      }
      try {
        const text = await runFoodHotspotAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `餐饮榜单分析失败：${message}` }], isError: true };
      }
    },
  );

  /**
   * 声量（菜单：其他 > 声量，URL 末段 `/report/media_volume`）。
   * ★ 特殊查询语法 ★：双空格=AND，双分号=OR。
   */
  const mvlOk = !!mediaVolumeConfigPathIfExists();
  server.registerTool(
    "meritco_media_volume",
    {
      description:
        "【何时调用】用户需要在久谦平台「声量」（菜单：其他 > 声量，URL 末段 `/report/media_volume`）里查**关键词在社媒（微博 / 小红书 / 抖音）的声量分布、帖子数、互动量、时间趋势**（例：`蜜雪冰城`、`雪王`）时，**优先使用本工具**。\n" +
        "【★ 特殊查询语法 ★】本工具的输入框支持组合查询：\n" +
        "  - `A` —— 单关键词常规检索\n" +
        "  - `A  B`（两个词之间**双空格**） —— 「A 和 B 都要命中」（AND 关系）\n" +
        "  - `A;;B`（**双分号**） —— 「A 或 B 任一命中」（OR 关系）\n" +
        "  - 可混用：例如 `蜜雪冰城  雪王;;茶颜悦色  雪王`\n" +
        "  Agent 必须按用户意图准确构造查询字符串；不要把双空格变单空格、不要把双分号变单分号。\n" +
        "【行为】Playwright 打开 media_volume 页 → 输入 `query` → 回车 → 等待报告稳定 → 返回正文。\n" +
        "【与其它工具的区别】本工具走 `/report/media_volume`，**只看『某关键词在社媒上的声量数据』**——比 `meritco_topic_traffic`（按话题分类）更原子化。\n" +
        "【参数】仅 `query` 生效，按上述语法构造。\n" +
        "【前置】无 Beta 标记，可常规使用。",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "声量查询词。语法：单词常规检索；双空格=AND；双分号=OR。例：`蜜雪冰城` / `蜜雪冰城  雪王` / `蜜雪冰城;;茶颜悦色`。",
          ),
      },
    },
    async ({ query }) => {
      if (!mvlOk) {
        return { content: [{ type: "text" as const, text: "meritco_media_volume 需要 meritco.media-volume.playwright.json。" }], isError: true };
      }
      try {
        const text = await runMediaVolumeAnalysis(query);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `声量分析失败：${message}` }], isError: true };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("[jqmcp] 致命错误:", e);
  process.exit(1);
});
