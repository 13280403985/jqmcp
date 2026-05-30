/**
 * 用户满意度分析（久谦菜单：用户 > 满意度分析，URL 末段 `/report/sentiment`）— Playwright 工具。
 *
 * 与 `consumptionScenarioMeritco` 完全对称的薄包装：使用 `meritco.satisfaction.playwright.json`，
 * 共用 `meritcoPageAnalysis` 的核心流程与同一持久化 Chromium profile，默认无头后台运行。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_SATISFACTION_CONFIG";
const DEFAULT_FILENAME = "meritco.satisfaction.playwright.json";
const LOG_PREFIX = "jqmcp-sat";

export function resolveSatisfactionConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function satisfactionConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runUserSatisfactionAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveSatisfactionConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
