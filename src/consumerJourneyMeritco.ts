/**
 * 消费者旅程（久谦菜单：市场 > 消费者旅程，URL 末段 `/report/market/journey`）— Playwright 工具。
 *
 * 与 `consumptionScenarioMeritco` / `userSatisfactionMeritco` / `emotionAnalysisMeritco` /
 * `marketMicroSceneMeritco` / `productValueMeritco` / `competeMeritco` 完全对称的薄包装：
 * 使用 `meritco.consumer-journey.playwright.json`，共用 `meritcoPageAnalysis` 的核心流程
 * 与同一持久化 Chromium profile，默认无头后台运行。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_JOURNEY_CONFIG";
const DEFAULT_FILENAME = "meritco.consumer-journey.playwright.json";
const LOG_PREFIX = "jqmcp-cj";

export function resolveConsumerJourneyConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function consumerJourneyConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runConsumerJourneyAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveConsumerJourneyConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
