/**
 * 品牌定位与业绩（久谦菜单：运营 > 品牌定位与业绩 Beta，URL 末段 `/report/databank/brand`）
 * — Playwright 工具。薄包装，单阶段。
 *
 * 报告聚焦：品牌定位（价格带 / 品类站位 / 人群） + 业绩盘点（声量 / 销量 / 增长 /
 * 市场份额 / 复购等）。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_BRAND_PERFORMANCE_CONFIG";
const DEFAULT_FILENAME = "meritco.brand-performance.playwright.json";
const LOG_PREFIX = "jqmcp-bpf";

export function resolveBrandPerformanceConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function brandPerformanceConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runBrandPerformanceAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveBrandPerformanceConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
