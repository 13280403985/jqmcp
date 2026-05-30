/**
 * 本地试跑 / 给 Python FastMCP 调用：营销有效性（双输入框）。
 *
 * 用法：
 *   npm run query:mka -- "<品牌>" "<对象/活动/事件>"
 *
 * 示例：
 *   npm run query:mka -- "蜜雪冰城" "520情侣证"
 *   npm run query:mka -- "瑞幸" "椰云拿铁"
 *   npm run query:mka -- "耐克" "CHBL高中联赛"
 *
 * Python 侧通过 argv[1]=brand, argv[2]=target 传入。
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runMarketingAssessmentAnalysis } = await import("../dist/assessmentMeritco.js");
const args = process.argv.slice(2);
const brand = (args[0] ?? "").trim();
const target = (args[1] ?? "").trim();
if (!brand || !target) {
  console.error(
    '用法：npm run query:mka -- "<品牌>" "<对象/活动/事件>"\n' +
      '  示例：npm run query:mka -- "蜜雪冰城" "520情侣证"',
  );
  process.exit(1);
}
const text = await runMarketingAssessmentAnalysis({ brand, target });
console.log(text);
