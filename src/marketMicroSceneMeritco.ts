/**
 * 微场景（久谦菜单：市场 > 微场景，URL 末段 `/report/market-micro-scene`）— Playwright 工具。
 *
 * 与 `consumptionScenarioMeritco` / `userSatisfactionMeritco` / `emotionAnalysisMeritco`
 * 完全对称的薄包装：使用 `meritco.market-micro-scene.playwright.json`，共用
 * `meritcoPageAnalysis` 的核心流程与同一持久化 Chromium profile，默认无头后台运行。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_MARKET_MICRO_SCENE_CONFIG";
const DEFAULT_FILENAME = "meritco.market-micro-scene.playwright.json";
const LOG_PREFIX = "jqmcp-mms";

export function resolveMarketMicroSceneConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function marketMicroSceneConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runMarketMicroSceneAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveMarketMicroSceneConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
