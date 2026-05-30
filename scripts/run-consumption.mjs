/**
 * 本地试跑 / 给 Python FastMCP 调用：消费场景分析
 *
 *   npm run query:mec -- "防晒霜"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runConsumptionScenarioAnalysis } = await import("../dist/consumptionScenarioMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error("用法：npm run query:mec -- \"关键词，例如 防晒霜\"");
  process.exit(1);
}
const text = await runConsumptionScenarioAnalysis(q);
console.log(text);
