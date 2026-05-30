/**
 * 叙事架构（久谦菜单：营销 > 叙事架构 Beta，URL 末段 `/report/hotpost`）
 * — Playwright 工具。薄包装，单阶段。
 *
 * 报告聚焦：品牌 / 品类的热门内容叙事框架（核心叙事母题、话题切入点、
 * 热门帖结构、传播路径、典型 hook 与转折等）。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_NARRATIVE_CONFIG";
const DEFAULT_FILENAME = "meritco.narrative.playwright.json";
const LOG_PREFIX = "jqmcp-nrf";

export function resolveNarrativeConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function narrativeConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runNarrativeAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveNarrativeConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
