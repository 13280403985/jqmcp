/**
 * 品牌原型（久谦菜单：市场 > 品牌 > 品牌原型，URL 末段 `/report/brandArchetype`）
 * — Playwright 工具。
 *
 * 与之前 11 个单阶段工具完全对称的薄包装：使用 `meritco.archetype.playwright.json`，
 * 共用 `meritcoPageAnalysis` 的核心流程与同一持久化 Chromium profile，默认无头后台运行。
 *
 * 报告主体：基于卡尔·荣格 12 种品牌原型（爱人/纯真者/创造者/关怀者/魔法师/探险家/
 * 英雄/反叛者/凡夫俗子/统治者/智者/开心果）拆分品牌人格，按各原型占比 `[NN%] <原型名>`
 * 排序列出概述、描述、典型观点、提及品牌、提及产品等结构化字段。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_ARCHETYPE_CONFIG";
const DEFAULT_FILENAME = "meritco.archetype.playwright.json";
const LOG_PREFIX = "jqmcp-arc";

export function resolveArchetypeConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function archetypeConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runBrandArchetypeAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveArchetypeConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
