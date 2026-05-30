/**
 * 本地试跑 / 给 Python FastMCP 调用：商品潜力
 *
 *   npm run query:spu -- "防晒喷雾"
 *   npm run query:spu -- "小米SU7"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runProductPotentialAnalysis } = await import("../dist/productPotentialMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error('用法：npm run query:spu -- "<商品/产品关键词，例如 防晒喷雾 或 小米SU7>"');
  process.exit(1);
}
const text = await runProductPotentialAnalysis(q);
console.log(text);
