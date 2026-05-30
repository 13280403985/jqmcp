/**
 * 本地试跑 / 给 Python FastMCP 调用：微场景分析
 *
 *   npm run query:mms -- "小米SU7"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runMarketMicroSceneAnalysis } = await import(
  "../dist/marketMicroSceneMeritco.js"
);
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:mms -- \"关键词，例如 小米SU7 或 防晒霜 vs 防晒喷雾\"",
  );
  process.exit(1);
}
const text = await runMarketMicroSceneAnalysis(q);
console.log(text);
