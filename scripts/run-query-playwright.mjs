/**
 * 本地试跑 Playwright（与 MCP 在 MERITCO_MODE=playwright 时同源）。
 * 凭证见 meritco.local.env 或环境变量。
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runUniversalSearchPlaywright } = await import("../dist/playwrightMeritco.js");
const q = process.argv.slice(2).join(" ").trim() || "测试";
const text = await runUniversalSearchPlaywright(q);
console.log(text);
