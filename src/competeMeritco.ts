/**
 * 竞品发现与对标（久谦菜单：市场/数据银行 > 竞品发现与对标，URL 末段 `/report/databank/competeV2`）— Playwright 工具。
 *
 * 与 `consumptionScenarioMeritco` / `userSatisfactionMeritco` / `emotionAnalysisMeritco` /
 * `marketMicroSceneMeritco` / `productValueMeritco` 完全对称的薄包装：使用
 * `meritco.compete.playwright.json`，共用 `meritcoPageAnalysis` 的核心流程与同一持久化
 * Chromium profile，默认无头后台运行。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_COMPETE_CONFIG";
const DEFAULT_FILENAME = "meritco.compete.playwright.json";
const LOG_PREFIX = "jqmcp-cmp";

export function resolveCompeteConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function competeConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runCompeteDiscovery(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveCompeteConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
