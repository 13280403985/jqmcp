/**
 * 本地试跑 / 给 Python FastMCP 调用：产品价值定位
 *
 *   npm run query:pv -- "小米SU7"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runProductValuePositioning } = await import(
  "../dist/productValueMeritco.js"
);
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:pv -- \"关键词，例如 小米SU7 或 花西子 vs 完美日记\"",
  );
  process.exit(1);
}
const text = await runProductValuePositioning(q);
console.log(text);
