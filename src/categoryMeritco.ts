/**
 * 品类动态与机会（久谦菜单：运营 > 品类动态与机会 Beta，URL 末段 `/report/databank/cate`）
 * — Playwright 工具。薄包装，单阶段。
 *
 * 报告聚焦：品类整体动态、增长机会、细分赛道、品类天花板与新兴趋势。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_CATEGORY_CONFIG";
const DEFAULT_FILENAME = "meritco.category.playwright.json";
const LOG_PREFIX = "jqmcp-cat";

export function resolveCategoryConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function categoryConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runCategoryDynamicsAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveCategoryConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
