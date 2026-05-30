/**
 * 本地试跑 / 给 Python FastMCP 调用：品牌定位与业绩
 *
 *   npm run query:bpf -- "蜜雪冰城"
 *   npm run query:bpf -- "小米SU7"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runBrandPerformanceAnalysis } = await import("../dist/brandPerformanceMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error('用法：npm run query:bpf -- "<品牌关键词，例如 蜜雪冰城 或 小米SU7>"');
  process.exit(1);
}
const text = await runBrandPerformanceAnalysis(q);
console.log(text);
