/**
 * 话题流量（久谦菜单：营销 > 话题流量 Beta，URL 末段 `/report/topic`）
 * — Playwright 工具。薄包装，单阶段。
 *
 * 报告聚焦：品牌 / 品类的话题 / hashtag 流量分布（热门话题排行、流量趋势、
 * 话题关联品牌、话题生命周期、流量 vs 转化等）。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_TOPIC_CONFIG";
const DEFAULT_FILENAME = "meritco.topic.playwright.json";
const LOG_PREFIX = "jqmcp-tpc";

export function resolveTopicConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function topicConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runTopicAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveTopicConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
