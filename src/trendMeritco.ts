/**
 * 流行趋势 / 产品设计趋势（久谦菜单：市场 > 流行趋势，URL 末段 `/report/productDesignTrend`）
 * — Playwright 工具。
 *
 * 与之前 8 个工具完全对称的薄包装：使用 `meritco.trend.playwright.json`，
 * 共用 `meritcoPageAnalysis` 的核心流程与同一持久化 Chromium profile，默认无头后台运行。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_TREND_CONFIG";
const DEFAULT_FILENAME = "meritco.trend.playwright.json";
const LOG_PREFIX = "jqmcp-trd";

export function resolveTrendConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function trendConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runTrendAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveTrendConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
