/**
 * 本地试跑 / 给 Python FastMCP 调用：品类动态与机会
 *
 *   npm run query:cat -- "新茶饮"
 *   npm run query:cat -- "新能源车"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runCategoryDynamicsAnalysis } = await import("../dist/categoryMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error('用法：npm run query:cat -- "<品类关键词，例如 新茶饮 或 新能源车>"');
  process.exit(1);
}
const text = await runCategoryDynamicsAnalysis(q);
console.log(text);
