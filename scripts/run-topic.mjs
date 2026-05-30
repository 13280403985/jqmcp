/**
 * 本地试跑 / 给 Python FastMCP 调用：话题流量
 *
 *   npm run query:tpc -- "蜜雪冰城"
 *   npm run query:tpc -- "雪王"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runTopicAnalysis } = await import("../dist/topicMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:tpc -- \"关键词，例如 蜜雪冰城 或 雪王\"",
  );
  process.exit(1);
}
const text = await runTopicAnalysis(q);
console.log(text);
