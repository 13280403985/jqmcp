import { playwrightConfigPathIfExists } from "./httpConfig.js";
import { runUniversalSearchPlaywright } from "./playwrightMeritco.js";

/**
 * 与 MCP / 网关请求体对齐。通用查询已固定为 Playwright，除 query 外字段仅作历史兼容，调用侧可省略。
 */
export type MeritcoUniversalOpts = {
  timeoutMs?: number;
  conversationId?: string | number;
  category?: string;
  page?: number;
  pageSize?: number;
};

/**
 * meritco_universal_search、CLI `npm run query:uni`、网关 `/v1/universal-search` 的共用入口。
 * 仅通过 Playwright（meritco.playwright.json）操作 bot 页并抽取正文；HTTP/WebSocket 通用查询分支已移除。
 */
export async function runMeritcoUniversalPreferred(
  query: string,
  _opts?: MeritcoUniversalOpts,
): Promise<string> {
  if (!playwrightConfigPathIfExists()) {
    throw new Error(
      "未找到 meritco.playwright.json（或 MERITCO_PLAYWRIGHT_CONFIG 指向的有效文件）；通用查询仅支持 Playwright。",
    );
  }
  return runUniversalSearchPlaywright(query);
}
