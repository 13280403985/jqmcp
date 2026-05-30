/**
 * 达人筛选与生成（久谦菜单：营销 > 达人筛选与生成 Beta，URL 末段 `/report/kol`）
 * — Playwright 工具。薄包装，单阶段。
 *
 * 注意：与其它工具不同，**输入的是达人 ID 或达人昵称**（不是品牌名）。
 * 报告聚焦：该达人的画像 / 内容偏好 / 粉丝结构 / 商业能力 / 适配品类等。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_KOL_CONFIG";
const DEFAULT_FILENAME = "meritco.kol.playwright.json";
const LOG_PREFIX = "jqmcp-kol";

export function resolveKolConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function kolConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runKolAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveKolConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
