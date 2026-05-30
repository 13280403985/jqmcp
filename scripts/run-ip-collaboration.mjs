/**
 * 本地试跑 / 给 Python FastMCP 调用：联名与代言
 *
 *   npm run query:ipc -- "蜜雪冰城"
 *   npm run query:ipc -- "瑞幸 vs Manner"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runIpCollaborationAnalysis } = await import("../dist/ipCollaborationMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:ipc -- \"关键词，例如 蜜雪冰城 或 瑞幸 vs Manner\"",
  );
  process.exit(1);
}
const text = await runIpCollaborationAnalysis(q);
console.log(text);
