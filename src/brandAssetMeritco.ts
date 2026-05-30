/**
 * 品牌资产（久谦菜单：市场 > 品牌 > 品牌资产，URL 末段 `/report/brandAsset`）
 * — Playwright 工具。薄包装，单阶段。
 *
 * 报告聚焦 Brand Equity / Brand Asset 视角：
 *   品牌资产维度（知名度 / 忠诚度 / 美誉度 / 联想度 / 感知质量 / 议价权 / 渠道力 等）
 * 按各维度占比 `[NN%] <资产维度>` 排序输出概述、描述、典型观点、提及品牌、提及产品。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_BRAND_ASSET_CONFIG";
const DEFAULT_FILENAME = "meritco.brand-asset.playwright.json";
const LOG_PREFIX = "jqmcp-ast";

export function resolveBrandAssetConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function brandAssetConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runBrandAssetAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveBrandAssetConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
