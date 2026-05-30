/**
 * 本地试跑 / 给 Python FastMCP 调用：品牌性格
 *
 *   npm run query:per -- "Manner"
 *   npm run query:per -- "小米SU7：对标性别"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runBrandPersonalityAnalysis } = await import("../dist/personalityMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:per -- \"关键词，例如 Manner 或 蜜雪冰城\"",
  );
  process.exit(1);
}
const text = await runBrandPersonalityAnalysis(q);
console.log(text);
