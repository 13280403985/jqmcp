/**
 * 本地试跑 / 给 Python FastMCP 调用：品牌原型
 *
 *   npm run query:arc -- "耐克"
 *   npm run query:arc -- "小米SU7 vs 理想MEGA"
 *   npm run query:arc -- "小米SU7：对标性别"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runBrandArchetypeAnalysis } = await import("../dist/archetypeMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:arc -- \"关键词，例如 耐克 或 小米SU7：对标性别\"",
  );
  process.exit(1);
}
const text = await runBrandArchetypeAnalysis(q);
console.log(text);
