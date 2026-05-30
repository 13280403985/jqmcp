/**
 * 声量（久谦菜单：其他 > 声量，URL 末段 `/report/media_volume`）
 * — Playwright 工具。薄包装，单阶段。
 *
 * ★ 特殊查询语法 ★：单输入框，但支持组合查询：
 *   - `A  B` （双空格分隔）：表示「A 和 B 都要命中」（AND 关系）
 *   - `A;;B` （双分号分隔）：表示「A 或 B 任一命中」（OR 关系）
 *   - 单关键词 `A`：常规检索
 *   - 也可混用：`蜜雪冰城  雪王;;茶颜悦色  雪王` 等
 *
 * 报告聚焦：关键词组合在社媒（微博 / 小红书 / 抖音）的声量分布、帖子数、互动量、
 * 时间趋势等。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_MEDIA_VOLUME_CONFIG";
const DEFAULT_FILENAME = "meritco.media-volume.playwright.json";
const LOG_PREFIX = "jqmcp-mvl";

export function resolveMediaVolumeConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function mediaVolumeConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runMediaVolumeAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveMediaVolumeConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
