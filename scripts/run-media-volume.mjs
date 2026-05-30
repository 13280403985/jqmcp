/**
 * 本地试跑 / 给 Python FastMCP 调用：声量
 *
 *   npm run query:mvl -- "蜜雪冰城"
 *   npm run query:mvl -- "蜜雪冰城  雪王"          ← 双空格 = AND
 *   npm run query:mvl -- "蜜雪冰城;;茶颜悦色"      ← 双分号 = OR
 *   npm run query:mvl -- "蜜雪冰城  雪王;;茶颜悦色  雪王"  ← AND + OR 组合
 *
 * 注意：PowerShell 双引号里写双空格/双分号都会被原样保留。
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runMediaVolumeAnalysis } = await import("../dist/mediaVolumeMeritco.js");
// 直接拼接所有 argv（保留中间双空格），不用 .trim() 防止破坏「双空格 = AND」语义
const raw = process.argv.slice(2).join(" ");
const q = raw.replace(/^\s+/, "").replace(/\s+$/, "");
if (!q) {
  console.error(
    '用法：npm run query:mvl -- "<查询词，支持 双空格=AND / 双分号=OR>"\n' +
      '  示例：npm run query:mvl -- "蜜雪冰城"\n' +
      '        npm run query:mvl -- "蜜雪冰城  雪王"              ← AND\n' +
      '        npm run query:mvl -- "蜜雪冰城;;茶颜悦色"          ← OR',
  );
  process.exit(1);
}
const text = await runMediaVolumeAnalysis(q);
console.log(text);
