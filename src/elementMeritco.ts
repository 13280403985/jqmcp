/**
 * 具体元素分析（久谦菜单：市场 > 具体元素分析，URL 末段 `/report/productAnalytic`）
 * — Playwright 工具。
 *
 * 与之前 9 个工具完全对称的薄包装：使用 `meritco.element.playwright.json`，
 * 共用 `meritcoPageAnalysis` 的核心流程与同一持久化 Chromium profile，默认无头后台运行。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_ELEMENT_CONFIG";
const DEFAULT_FILENAME = "meritco.element.playwright.json";
const LOG_PREFIX = "jqmcp-elm";

export function resolveElementConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function elementConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runElementAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveElementConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
