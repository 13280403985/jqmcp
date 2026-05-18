import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { resolveConfigDir } from "./httpConfig.js";

/** 与 playwrightMeritco 一致：判断是否仍在登录页 */
function looksLikeLoginUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\/(login|signin)(\/|$)/.test(path);
  } catch {
    return /\/login/i.test(url);
  }
}

/** 从 meritco.playwright.json 读取 startUrl（若存在） */
function readStartUrl(configDir: string): string {
  const p = resolve(configDir, "meritco.playwright.json");
  if (!existsSync(p)) {
    return "https://research.meritco-group.com/report/custom/bot";
  }
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as { startUrl?: string };
    return typeof j.startUrl === "string" && j.startUrl.trim()
      ? j.startUrl.trim()
      : "https://research.meritco-group.com/report/custom/bot";
  } catch {
    return "https://research.meritco-group.com/report/custom/bot";
  }
}

function readUserAgent(configDir: string): string | undefined {
  const p = resolve(configDir, "meritco.playwright.json");
  if (!existsSync(p)) return undefined;
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as { userAgent?: string };
    const u = j.userAgent?.trim();
    return u || undefined;
  } catch {
    return undefined;
  }
}

/** .env 行内值含空格、=、# 时加双引号并转义 */
function escapeEnvValue(v: string): string {
  if (/[\s#"']/.test(v) || v.includes("=")) {
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return v;
}

/**
 * 更新或追加 MERITCO_* 行，保留其余行与注释。
 */
function upsertEnvKeys(filePath: string, pairs: Record<string, string>): void {
  const keys = Object.keys(pairs);
  const lines = existsSync(filePath) ? readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const used = new Set<string>();

  const out = lines.map((line) => {
    const trimmed = line.trim();
    for (const key of keys) {
      if (trimmed.startsWith(`${key}=`) || new RegExp(`^${key}\\s*=`).test(trimmed)) {
        used.add(key);
        return `${key}=${escapeEnvValue(pairs[key]!)}`;
      }
    }
    return line;
  });

  for (const key of keys) {
    if (!used.has(key)) {
      out.push(`${key}=${escapeEnvValue(pairs[key]!)}`);
    }
  }

  writeFileSync(filePath, out.join("\n").replace(/\n*$/, "\n"), "utf8");
}

/**
 * Playwright 打开久谦 → 等待登录 → 将 Cookie / Token 写回 meritco.local.env。
 * 不自动改 MERITCO_CONVERSATION_ID（须 DevTools→WS 手动抄）。
 *
 * 环境变量：
 * - MERITCO_CONFIG_DIR：项目根（默认 cwd）
 * - MERITCO_STORAGE_STATE：已有登录态 JSON（可选）
 * - MERITCO_SYNC_HEADLESS=1：无头（首次登录建议不设）
 * - MERITCO_SYNC_SAVE_STORAGE=0：不写回 meritco-auth.json（默认会写，便于下次）
 */
async function main(): Promise<void> {
  const configDir = resolveConfigDir();
  const startUrl = readStartUrl(configDir);
  const ua = readUserAgent(configDir);
  const envFile = resolve(configDir, "meritco.local.env");
  const storageRaw = process.env.MERITCO_STORAGE_STATE?.trim();
  const storagePath = storageRaw
    ? resolve(storageRaw)
    : resolve(configDir, "meritco-auth.json");
  const useStorage = existsSync(storagePath);
  const headless = process.env.MERITCO_SYNC_HEADLESS?.trim() === "1";
  const saveStorage = process.env.MERITCO_SYNC_SAVE_STORAGE?.trim() !== "0";

  let capturedToken = "";

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      ...(ua ? { userAgent: ua } : {}),
      ...(useStorage ? { storageState: storagePath } : {}),
    });
    const page = await context.newPage();

    page.on("request", (req) => {
      try {
        if (!req.url().includes("research.meritco-group.com")) return;
        const h = req.headers();
        const t = h["token"] ?? h["Token"];
        if (t && !capturedToken) capturedToken = t.trim();
      } catch {
        /* ignore */
      }
    });

    console.error(`[jqmcp-sync] 打开 ${startUrl}（headless=${headless}）…`);
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });

    const maxWaitMs = 300_000;
    const t0 = Date.now();
    while (looksLikeLoginUrl(page.url()) && Date.now() - t0 < maxWaitMs) {
      console.error("[jqmcp-sync] 检测到登录页，请在浏览器中完成登录…");
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (looksLikeLoginUrl(page.url())) {
      throw new Error("等待登录超时。可设 MERITCO_SYNC_HEADLESS=0 手动登录，或使用 MERITCO_STORAGE_STATE 指向已登录的 storage 文件。");
    }

    console.error(`[jqmcp-sync] 当前页: ${page.url()}`);
    /** 再等一会，让首条带 Token 的 XHR 发出 */
    await new Promise((r) => setTimeout(r, 3000));

    const all = await context.cookies();
    const relevant = all.filter(
      (c) =>
        c.domain.includes("meritco-group.com") ||
        c.domain.endsWith("research.meritco-group.com"),
    );
    const cookieHeader = relevant.map((c) => `${c.name}=${c.value}`).join("; ");

    if (!cookieHeader.trim()) {
      console.error("[jqmcp-sync] 警告：未采集到任何 meritco-group.com Cookie，仍尝试写 MERITCO_COOKIE 为空以外的历史行为。");
    }

    const updates: Record<string, string> = {
      MERITCO_COOKIE: cookieHeader || "",
    };
    if (capturedToken) {
      updates.MERITCO_TOKEN = capturedToken;
      console.error(`[jqmcp-sync] 已从请求头捕获 Token（长度 ${capturedToken.length}）`);
    } else {
      console.error(
        "[jqmcp-sync] 未从网络请求捕获 Token，请手动在 meritco.local.env 填写 MERITCO_TOKEN，或再运行一次并先在页面内触发一次查询。",
      );
    }

    if (!existsSync(envFile)) {
      writeFileSync(
        envFile,
        `# 由 npm run sync:env 生成/更新。MERITCO_CONVERSATION_ID 请从 DevTools→WS 手动填写。\n\nMERITCO_CONVERSATION_ID=\n`,
        "utf8",
      );
    }

    upsertEnvKeys(envFile, updates);
    console.error(`[jqmcp-sync] 已更新 ${envFile}（MERITCO_COOKIE${capturedToken ? " + MERITCO_TOKEN" : ""}）`);

    if (saveStorage) {
      await context.storageState({ path: storagePath });
      console.error(`[jqmcp-sync] 已保存 Playwright 登录态: ${storagePath}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("[jqmcp-sync] 失败:", e instanceof Error ? e.message : e);
  process.exit(1);
});
