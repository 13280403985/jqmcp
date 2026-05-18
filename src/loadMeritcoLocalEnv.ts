import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveConfigDir } from "./httpConfig.js";

/**
 * 从配置目录加载 KEY=VALUE（# 开头为注释）。
 * 仅当 process.env[KEY] 尚未设置时才写入：MCP / 终端里已 export 的变量优先生效。
 * 优先读 meritco.local.env；不存在时再读 .env（均在 MERITCO_CONFIG_DIR 或 cwd 下）。
 */
export function loadMeritcoLocalEnv(): { loaded: boolean; path?: string; keysApplied: number } {
  const dir = resolveConfigDir();
  const primary = resolve(dir, "meritco.local.env");
  if (existsSync(primary)) {
    return { loaded: true, path: primary, keysApplied: applyEnvFile(primary) };
  }
  const fallback = resolve(dir, ".env");
  if (existsSync(fallback)) {
    return { loaded: true, path: fallback, keysApplied: applyEnvFile(fallback) };
  }
  return { loaded: false, keysApplied: 0 };
}

function applyEnvFile(filePath: string): number {
  const raw = readFileSync(filePath, "utf8").replace(/^\ufeff/, "");
  let n = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!key) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
      n += 1;
    }
  }
  return n;
}
