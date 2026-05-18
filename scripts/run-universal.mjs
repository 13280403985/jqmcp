/**
 * 与 MCP meritco_universal_search 同源：固定走 Playwright（meritco.playwright.json）。
 *
 *   npm run query:uni -- "你的问题"
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.MERITCO_CONFIG_DIR ??= root;

const { loadMeritcoLocalEnv } = await import("../dist/loadMeritcoLocalEnv.js");
loadMeritcoLocalEnv();

const { runMeritcoUniversalPreferred } = await import("../dist/universalMeritco.js");
const q = process.argv.slice(2).join(" ").trim() || "测试";
const text = await runMeritcoUniversalPreferred(q);
console.log(text);
