import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 读取 Cookie 字符串：优先 MERITCO_COOKIE_FILE（避免 PowerShell 行长度截断），否则 MERITCO_COOKIE。
 * 绝不把完整值写入日志。
 */
export function requireMeritcoCookie(): string {
  const fp = process.env.MERITCO_COOKIE_FILE?.trim();
  if (fp) {
    const abs = resolve(fp);
    if (!existsSync(abs)) {
      throw new Error(`MERITCO_COOKIE_FILE 不存在：${abs}`);
    }
    const raw = readFileSync(abs, "utf8").trim().replace(/^\ufeff/, "");
    if (!raw) throw new Error("MERITCO_COOKIE_FILE 指向的文件为空");
    return raw.replace(/\r\n/g, "\n").split("\n")[0]!.trim();
  }
  const c = process.env.MERITCO_COOKIE?.trim();
  if (!c) {
    throw new Error(
      "缺少 Cookie：请设置 MERITCO_COOKIE，或使用 MERITCO_COOKIE_FILE 指向仅含一行 Cookie 的文本文件",
    );
  }
  return c;
}

/** 用于错误信息：只展示 Cookie 是否存在及长度 */
export function cookieDebugHint(): string {
  if (process.env.MERITCO_COOKIE_FILE?.trim()) return "MERITCO_COOKIE_FILE 已设置";
  const c = process.env.MERITCO_COOKIE;
  if (!c) return "MERITCO_COOKIE 未设置";
  return `MERITCO_COOKIE 已设置（长度 ${c.length}）`;
}

/**
 * 将 "a=1; b=2" 解析为 Playwright addCookies 所需的条目（仅作简单拆分，不含 Set-Cookie 全字段）。
 */
export function parseCookieHeader(header: string, domain: string, path: string) {
  const parts = header.split(";").map((s) => s.trim()).filter(Boolean);
  const cookies: { name: string; value: string; domain: string; path: string }[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    cookies.push({ name, value, domain, path });
  }
  if (!cookies.length) {
    throw new Error("MERITCO_COOKIE 无法解析为任何键值对，请确认格式为 a=b; c=d");
  }
  return cookies;
}

export type MeritcoMode = "http" | "playwright";

/**
 * MERITCO_MODE 未设置时：若存在 meritco.playwright.json 则默认 playwright；
 * 否则再用 http。显式 MERITCO_MODE=http|playwright 可覆盖。
 */
export function resolveMode(httpConfigExists: boolean, playwrightConfigExists: boolean): MeritcoMode {
  const m = process.env.MERITCO_MODE?.trim().toLowerCase();
  if (m === "http" || m === "playwright") return m;
  if (playwrightConfigExists) return "playwright";
  if (httpConfigExists) return "http";
  return "playwright";
}
