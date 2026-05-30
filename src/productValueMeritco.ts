/**
 * 产品价值定位（久谦菜单：市场 > 产品价值定位，URL 末段 `/report/market/productValue`）— Playwright 工具。
 *
 * 与 `consumptionScenarioMeritco` / `userSatisfactionMeritco` / `emotionAnalysisMeritco` /
 * `marketMicroSceneMeritco` 完全对称的薄包装：使用 `meritco.product-value.playwright.json`，
 * 共用 `meritcoPageAnalysis` 的核心流程与同一持久化 Chromium profile，默认无头后台运行。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_PRODUCT_VALUE_CONFIG";
const DEFAULT_FILENAME = "meritco.product-value.playwright.json";
const LOG_PREFIX = "jqmcp-pv";

export function resolveProductValueConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function productValueConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runProductValuePositioning(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveProductValueConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
