/**
 * 餐饮榜单（久谦菜单：其他 > 餐饮榜单，URL 末段 `/report/hotspot`）
 * — Playwright 工具。薄包装，按单阶段处理。
 *
 * 报告聚焦：餐饮品牌 / 菜系 / 城市的热度榜单（粉丝增长、声量、上新、热门门店等）。
 * 用户标记『自己摸索』——具体输入语义/页面交互可能与其它工具略不同，
 * 实测可能需要调整 selector 或加默认输入兜底。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_FOOD_HOTSPOT_CONFIG";
const DEFAULT_FILENAME = "meritco.food-hotspot.playwright.json";
const LOG_PREFIX = "jqmcp-fhs";

export function resolveFoodHotspotConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function foodHotspotConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runFoodHotspotAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveFoodHotspotConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
