/**
 * 消费场景分析（久谦菜单：用户 > 消费场景分析，URL 末段 `/report/mec`）— Playwright 工具。
 *
 * 实现仅是 `meritcoPageAnalysis` 的薄包装：使用 `meritco.consumption.playwright.json` 配置，
 * 共用同一持久化 Chromium profile，默认无头后台运行。
 *
 * 对外保持原 API：`runConsumptionScenarioAnalysis(query)`、`consumptionConfigPathIfExists`、
 * `resolveConsumptionConfigPath`，避免影响 `src/server.ts` 与 `scripts/run-consumption.mjs`。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_CONSUMPTION_CONFIG";
const DEFAULT_FILENAME = "meritco.consumption.playwright.json";
const LOG_PREFIX = "jqmcp-mec";

export function resolveConsumptionConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function consumptionConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runConsumptionScenarioAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveConsumptionConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
