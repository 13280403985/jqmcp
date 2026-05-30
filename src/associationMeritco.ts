/**
 * 品牌联想（久谦菜单：市场 > 品牌 > 品牌联想，URL 末段 `/report/association`）
 * — Playwright 工具。
 *
 * 与之前 10 个单阶段工具完全对称的薄包装：使用 `meritco.association.playwright.json`，
 * 共用 `meritcoPageAnalysis` 的核心流程与同一持久化 Chromium profile，默认无头后台运行。
 *
 * 注意：和 `brand_identity`（两阶段：候选→报告）不同，本工具是**单阶段**——
 * 输入品牌/品类关键词 + 回车即可在页面右侧直接生成联想词分布报告。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_ASSOCIATION_CONFIG";
const DEFAULT_FILENAME = "meritco.association.playwright.json";
const LOG_PREFIX = "jqmcp-asn";

export function resolveAssociationConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function associationConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runBrandAssociationAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveAssociationConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
