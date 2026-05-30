/**
 * 品牌性格（久谦菜单：市场 > 品牌 > 品牌性格，URL 末段 `/report/personality`）
 * — Playwright 工具。薄包装，单阶段。
 *
 * 报告基于品牌个性『大五』理论（Brand Personality Big Five）：
 *   真诚 Sincerity / 激情 Excitement / 精致 Sophistication / 可靠 Reliability / 强韧 Ruggedness
 * 按各维度占比 `[NN%] <维度名>` 排序输出概述、描述、典型观点、提及品牌、提及产品。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_PERSONALITY_CONFIG";
const DEFAULT_FILENAME = "meritco.personality.playwright.json";
const LOG_PREFIX = "jqmcp-per";

export function resolvePersonalityConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function personalityConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runBrandPersonalityAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolvePersonalityConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
