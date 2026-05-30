/**
 * 联名与代言（久谦菜单：营销 > 联名与代言 Beta，URL 末段 `/report/ipV2`）
 * — Playwright 工具。薄包装，单阶段。
 *
 * 报告聚焦：品牌的 IP 联名 / 代言人 / 跨界合作资产盘点（联名对象、代言人组合、
 * 合作品类与频次、典型案例、社媒话题影响等）。
 */
import {
  pageConfigPathIfExists,
  resolvePageConfigPath,
  runMeritcoPageAnalysis,
} from "./meritcoPageAnalysis.js";

const ENV_VAR = "MERITCO_IP_COLLABORATION_CONFIG";
const DEFAULT_FILENAME = "meritco.ip-collaboration.playwright.json";
const LOG_PREFIX = "jqmcp-ipc";

export function resolveIpCollaborationConfigPath(): string {
  return resolvePageConfigPath({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export function ipCollaborationConfigPathIfExists(): string | null {
  return pageConfigPathIfExists({ envVar: ENV_VAR, defaultFilename: DEFAULT_FILENAME });
}

export async function runIpCollaborationAnalysis(query: string): Promise<string> {
  return runMeritcoPageAnalysis(query, {
    configPath: resolveIpCollaborationConfigPath(),
    logPrefix: LOG_PREFIX,
  });
}
