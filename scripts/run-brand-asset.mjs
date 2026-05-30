/**
 * 本地试跑 / 给 Python FastMCP 调用：品牌资产
 *
 *   npm run query:ast -- "蜜雪冰城"
 *   npm run query:ast -- "小米SU7 vs 理想MEGA"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runBrandAssetAnalysis } = await import("../dist/brandAssetMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:ast -- \"关键词，例如 蜜雪冰城 或 小米SU7：对标性别\"",
  );
  process.exit(1);
}
const text = await runBrandAssetAnalysis(q);
console.log(text);
