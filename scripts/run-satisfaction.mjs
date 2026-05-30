/**
 * 本地试跑 / 给 Python FastMCP 调用：用户满意度分析
 *
 *   npm run query:sat -- "防晒霜"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runUserSatisfactionAnalysis } = await import("../dist/userSatisfactionMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error("用法：npm run query:sat -- \"关键词，例如 防晒霜 或 小米SU7 vs 理想MEGA\"");
  process.exit(1);
}
const text = await runUserSatisfactionAnalysis(q);
console.log(text);
