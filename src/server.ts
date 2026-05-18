import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { loadMeritcoLocalEnv } from "./loadMeritcoLocalEnv.js";
import { httpConfigPathIfExists, playwrightConfigPathIfExists } from "./httpConfig.js";
import { resolveMode, cookieDebugHint } from "./env.js";
import { runUniversalSearchHttp } from "./httpMeritco.js";
import { runMeritcoUniversalPreferred } from "./universalMeritco.js";

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

/** 在进程启动时校验模式与配置文件，避免首次工具调用才失败 */
function validateStartup(mode: "http" | "playwright"): void {
  const httpOk = !!httpConfigPathIfExists();
  const pwOk = !!playwrightConfigPathIfExists();

  if (!httpOk && !pwOk) {
    console.error(
      "未找到 meritco.http.json 与 meritco.playwright.json，请至少配置其一（通用查询需要 playwright 配置）。",
    );
    process.exit(1);
  }

  if (mode === "http" && !httpOk) {
    if (pwOk) {
      console.error(
        "[jqmcp] MERITCO_MODE=http 但未找到 meritco.http.json：meritco_history_get 不可用；meritco_universal_search 仍可走 Playwright。",
      );
    } else {
      console.error(
        "MERITCO_MODE=http 但未找到 meritco.http.json。请复制 config/meritco.http.example.json 并填写抓包结果。",
      );
      process.exit(1);
    }
  }
  if (mode === "playwright" && !pwOk) {
    console.error(
      "MERITCO_MODE=playwright 但未找到 meritco.playwright.json。请复制 config/meritco.playwright.example.json 并填写选择器。",
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  /** 与终端共用 meritco.local.env：MCP 仅配 MERITCO_CONFIG_DIR 即可拉齐 Cookie/Token/会话 id */
  const le = loadMeritcoLocalEnv();
  if (le.loaded && process.env.MERITCO_DEBUG_LOCAL_ENV?.trim() === "1") {
    console.error(`[jqmcp] 本地环境文件 ${le.path}，补全 ${le.keysApplied} 个未预设键`);
  }

  const httpOk = !!httpConfigPathIfExists();
  const pwOk = !!playwrightConfigPathIfExists();
  const mode = resolveMode(httpOk, pwOk);
  validateStartup(mode);

  // MCP 规范：stdio 传输下勿向 stdout 打印调试信息，仅使用 stderr
  console.error(`[jqmcp] 模式=${mode}；通用查询=Playwright（meritco.playwright.json）；${cookieDebugHint()}`);

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
        "【勿与本工具混淆】要拉 **history/get、会话列表、分页 JSON** 等 HTTP 契约，请用 **meritco_history_get**（依赖 meritco.http.json），不要用本工具。\n" +
        "【参数】仅 **`query`**（用户问题/检索词）生效；`page` / `pageSize` / `timeoutMs` / `conversationId` / `category` 传入也会被忽略（为兼容旧客户端保留）。\n" +
        "【前置】根目录需有 **meritco.playwright.json**（`bodySelector` / 可选 `extractSelector` 等）。登录态推荐 **MERITCO_USE_PERSIST_PROFILE=1** 且先执行 `npm run meritco:profile`；或 MERITCO_COOKIE / MERITCO_COOKIE_FILE / MERITCO_STORAGE_STATE；部分环境需 **MERITCO_TOKEN**。通用查询默认**无头后台**（不弹浏览器）；需看窗口调试时设 **MERITCO_PLAYWRIGHT_HEADLESS=0**。",
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
   * 显式暴露 history/get 契约：始终走 HTTP（不随 MERITCO_MODE 切 Playwright），便于与页面长文并存。
   */
  server.registerTool(
    "meritco_history_get",
    {
      description:
        "调用 meritco.http.json 中的 HTTP 契约（默认 history/get，body 含 conversationId、category）。返回 JSON 文本。需 MERITCO_COOKIE、MERITCO_TOKEN；不受 MERITCO_MODE=playwright 影响。",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("可选：填入 {{query}}；纯数字时也可作为 conversationId（与 universal_search HTTP 行为一致）"),
        ...paginationSchema,
        ...conversationSchema,
      },
    },
    async ({ query, timeoutMs, page, pageSize, conversationId, category }) => {
      if (!httpOk) {
        return {
          content: [
            {
              type: "text" as const,
              text: "meritco_history_get 需要项目目录下的 meritco.http.json（MERITCO_HTTP_CONFIG 可指向绝对路径）。",
            },
          ],
          isError: true,
        };
      }
      try {
        const q = query?.trim() ?? "";
        const text = await runUniversalSearchHttp(q, timeoutMs, {
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
          content: [{ type: "text" as const, text: `history/get 失败：${message}` }],
          isError: true,
        };
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
