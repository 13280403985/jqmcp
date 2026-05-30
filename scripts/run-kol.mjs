/**
 * 本地试跑 / 给 Python FastMCP 调用：达人筛选与生成
 *
 *   npm run query:kol -- "李佳琦"
 *   npm run query:kol -- "1997MXBC"   ← 达人 ID 也行
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runKolAnalysis } = await import("../dist/kolMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:kol -- \"达人 ID 或达人名，例如 李佳琦 或 1997MXBC\"",
  );
  process.exit(1);
}
const text = await runKolAnalysis(q);
console.log(text);
