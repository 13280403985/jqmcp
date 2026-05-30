/**
 * 本地试跑 / 给 Python FastMCP 调用：品牌联想
 *
 *   npm run query:asn -- "蜜雪冰城"
 *   npm run query:asn -- "花西子 vs 完美日记"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runBrandAssociationAnalysis } = await import("../dist/associationMeritco.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error(
    "用法：npm run query:asn -- \"关键词，例如 蜜雪冰城 或 花西子 vs 完美日记\"",
  );
  process.exit(1);
}
const text = await runBrandAssociationAnalysis(q);
console.log(text);
