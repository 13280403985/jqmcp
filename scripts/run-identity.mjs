/**
 * 本地试跑 / 给 Python FastMCP 调用：品牌主张（两阶段交互）。
 *
 * 用法：
 *   阶段一  npm run query:idt -- "蜜雪冰城"
 *   阶段二  npm run query:idt -- "蜜雪冰城" 1997MXBC
 *
 * Python 侧（mcp-server/server.py）通过 argv[2] 注入 accountId。
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runBrandIdentityAnalysis } = await import("../dist/identityMeritco.js");
const args = process.argv.slice(2);
const query = (args[0] ?? "").trim();
const accountId = (args[1] ?? "").trim();
if (!query) {
  console.error(
    '用法：npm run query:idt -- "<品牌关键词>" [accountId]\n' +
      '  阶段一（拿候选）  npm run query:idt -- "蜜雪冰城"\n' +
      '  阶段二（拿报告）  npm run query:idt -- "蜜雪冰城" 1997MXBC',
  );
  process.exit(1);
}
const text = await runBrandIdentityAnalysis(query, accountId ? { accountId } : {});
console.log(text);
