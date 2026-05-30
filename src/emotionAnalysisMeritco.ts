/**
 * 情绪分析（久谦菜单：用户 > 情绪分析，URL 末段 `/report/emotion`）— Playwright 工具。
 *
 * 与 `consumptionScenarioMeritco` / `userSatisfactionMeritco` 完全对称的薄包装：
 * 使用 `meritco.emotion.playwright.json`，共用 `meritcoPageAnalysis` 的核心流程与
 * 同一持久化 Chromium profile，默认无头后台运行。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_EMOTION_CONFIG";
const DEFAULT_FILENAME = "meritco.emotion.playwright.json";
const LOG_PREFIX = "jqmcp-emo";

export function resolveEmotionConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function emotionConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runEmotionAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveEmotionConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
