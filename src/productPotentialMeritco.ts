/**
 * 商品潜力（久谦菜单：运营 > 商品潜力 Beta，URL 末段 `/report/databank/spu`）
 * — Playwright 工具。薄包装，单阶段。'spu' = Standard Product Unit。
 *
 * 报告聚焦：商品（SKU/SPU 级别）的市场潜力、销量预测、定价空间、竞品 SPU 对比、
 * 同类替代风险与机会窗口。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_PRODUCT_POTENTIAL_CONFIG";
const DEFAULT_FILENAME = "meritco.product-potential.playwright.json";
const LOG_PREFIX = "jqmcp-spu";

export function resolveProductPotentialConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function productPotentialConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runProductPotentialAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveProductPotentialConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
