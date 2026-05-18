/**
 * 本地试跑 HTTP 搜索（与 MCP 工具同源逻辑）。
 * 凭证见 meritco.local.env 或环境变量。
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runUniversalSearchHttp } = await import("../dist/httpMeritco.js");
const q = process.argv.slice(2).join(" ").trim() || "测试";
const text = await runUniversalSearchHttp(q);
console.log(text);
