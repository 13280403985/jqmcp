/**
 * 本地试跑 / 给 Python FastMCP 调用：流行趋势 / 产品设计趋势
 *
 *   npm run query:trd -- "小米SU7"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runTrendAnalysis } = await import("../dist/trendMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:trd -- \"关键词，例如 小米SU7 或 花西子 vs 完美日记\"",
  );
  process.exit(1);
}
const text = await runTrendAnalysis(q);
console.log(text);
