/**
 * 本地试跑 / 给 Python FastMCP 调用：餐饮榜单
 *
 *   npm run query:fhs -- "蜜雪冰城"
 *   npm run query:fhs -- "火锅"
 *   npm run query:fhs -- "上海"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runFoodHotspotAnalysis } = await import("../dist/foodHotspotMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error('用法：npm run query:fhs -- "<关键词，例如 蜜雪冰城 / 火锅 / 上海>"');
  process.exit(1);
}
const text = await runFoodHotspotAnalysis(q);
console.log(text);
