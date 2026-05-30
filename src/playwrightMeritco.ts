import { existsSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import {
  loadPlaywrightConfig,
  resolveConfigDir,
  resolvePlaywrightConfigPath,
  type MeritcoPlaywrightConfig,
} from "./httpConfig.js";
import { preferAnswerBodyFromFlatText } from "./answerTextPostprocess.js";
import { parseCookieHeader, requireMeritcoCookie } from "./env.js";
import { resolveChromiumUserDataDirForPlaywright } from "./meritcoChromiumProfile.js";

/**
 * 通用查询使用的 Chromium 是否无头。
 * **默认始终在后台（无头）**，避免 MCP / CLI 每次调用都弹出浏览器窗口。
 * 需要看窗口本地排查时，设 **MERITCO_PLAYWRIGHT_HEADLESS=0**（有头；MCP 无桌面时可能崩溃）。
 */
function resolvePlaywrightHeadlessForUniversalSearch(): { headless: boolean; logLine: string } {
  const v = process.env.MERITCO_PLAYWRIGHT_HEADLESS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") {
    return { headless: false, logLine: "MERITCO_PLAYWRIGHT_HEADLESS=0（有头窗口，仅建议本机终端调试用）" };
  }
  if (v === "1" || v === "true" || v === "on") {
    return { headless: true, logLine: "MERITCO_PLAYWRIGHT_HEADLESS=1（显式无头）" };
  }
  return { headless: true, logLine: "默认无头（后台运行，不弹窗）" };
}

/** Chromium 启动附加参数（持久化 / 非持久化共用，缓解部分环境闪退） */
function chromiumExtraLaunchArgs(): string[] {
  const out = ["--disable-dev-shm-usage"];
  if (process.env.MERITCO_PLAYWRIGHT_DISABLE_GPU?.trim() === "1") {
    out.push("--disable-gpu");
  }
  return out;
}

/** 判断是否被重定向到登录/授权页（路径常见 /login、/signin） */
function looksLikeLoginUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\/(login|signin)(\/|$)/.test(path);
  } catch {
    return /\/login/i.test(url);
  }
}

function assertNotLoginPage(page: Page, phase: string): void {
  const url = page.url();
  if (!looksLikeLoginUrl(url)) return;
  console.error(`[jqmcp-playwright] ${phase} 当前 URL: ${url}`);
  throw new Error(
    "久谦当前要求登录，Playwright 未带上有效登录态。\n\n" +
      "请先在本机完成一次持久化登录：\n" +
      "1) 在项目目录执行 `npm run build && npm run meritco:profile`\n" +
      "2) 弹出 Chromium 后登录并进入 bot\n" +
      "3) 终端按回车关闭浏览器，再重试工具调用\n\n" +
      "通用查询默认只走持久化 profile（meritco-chromium-profile），不会主动要求你维护 Cookie/Token。",
  );
}

/** startUrl 的 hostname，用于与 cookieDomain 双写 Cookie */
function hostnameFromStartUrl(cfg: MeritcoPlaywrightConfig): string {
  try {
    return new URL(cfg.startUrl).hostname;
  } catch {
    return "research.meritco-group.com";
  }
}

/** 将同一 Cookie 串写入主机名域与配置域，减少服务端 Set-Cookie 域与 Playwright 不一致时丢会话 */
function mergeCookieDomains(cookieHeader: string, cfg: MeritcoPlaywrightConfig) {
  const p = cfg.cookiePath || "/";
  const host = hostnameFromStartUrl(cfg);
  const dom = (cfg.cookieDomain || ".meritco-group.com").trim();
  const batchA = parseCookieHeader(cookieHeader, host, p);
  const batchB = parseCookieHeader(cookieHeader, dom, p);
  const seen = new Set<string>();
  const out: typeof batchA = [];
  for (const c of [...batchA, ...batchB]) {
    const k = `${c.name}\0${c.domain}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** 与浏览器一致：部分页面接口依赖 Token 请求头 */
function extraHeadersFromEnv(): Record<string, string> {
  const token = process.env.MERITCO_TOKEN?.trim();
  if (!token) return {};
  return { Token: token };
}

/**
 * 从 Playwright storage JSON 读取 research 源下 localStorage 的 token（久谦前端鉴权常用）。
 */
function readLocalStorageTokenFromStorageFile(absPath: string): string | null {
  try {
    const j = JSON.parse(readFileSync(absPath, "utf8")) as {
      origins?: { origin?: string; localStorage?: { name: string; value: string }[] }[];
    };
    const origins = j.origins;
    if (!Array.isArray(origins)) return null;
    for (const o of origins) {
      if (!o?.origin?.includes("research.meritco-group.com")) continue;
      const ls = o.localStorage;
      if (!Array.isArray(ls)) continue;
      for (const row of ls) {
        if (row?.name === "token" && typeof row.value === "string" && row.value.trim()) {
          return row.value.trim();
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Token 请求头：使用 storage 内 localStorage.token 与 MERITCO_TOKEN 对齐。
 * codegen 保存的会话以 localStorage 为准；若 env 里仍是旧 Token，会导致仍跳登录页。
 */
function extraHeadersWithStorageSync(storagePath: string | null, useStorage: boolean): Record<string, string> {
  const envTok = process.env.MERITCO_TOKEN?.trim() ?? "";
  if (!useStorage || !storagePath) {
    return extraHeadersFromEnv();
  }
  const fileTok = readLocalStorageTokenFromStorageFile(storagePath);
  if (!fileTok) {
    return extraHeadersFromEnv();
  }
  if (envTok && envTok !== fileTok) {
    console.error(
      "[jqmcp-playwright] MERITCO_TOKEN 与 meritco-auth.json 中 localStorage.token 不一致，已**以 storage 为准**设置请求头 Token（请同步更新 meritco.local.env 里的 MERITCO_TOKEN 以免混淆）。",
    );
  }
  return { Token: fileTok };
}

/** 合并配置与内置回退，先精确后模糊，减少 placeholder 改版导致超时 */
function buildSearchCandidates(cfg: MeritcoPlaywrightConfig): string[] {
  const ordered: string[] = [];
  const p = cfg.searchInputSelector?.trim();
  if (p) ordered.push(p);
  if (Array.isArray(cfg.searchInputSelectors)) {
    for (const s of cfg.searchInputSelectors) {
      if (typeof s === "string" && s.trim()) ordered.push(s.trim());
    }
  }
  const fallbacks = [
    "textarea[placeholder*='你想了解']",
    "textarea[placeholder*='输入']",
    "textarea[placeholder*='问题']",
    "textarea[placeholder*='查询']",
    "input[type='text'][placeholder*='输入']",
    "input[placeholder*='输入']",
    "div.ProseMirror[contenteditable='true']",
    "div[contenteditable='true']",
    "textarea",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...ordered, ...fallbacks]) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** 可见且占位非零，避免匹配到隐藏节点 */
async function tryVisibleInput(locator: Locator, timeoutMs: number): Promise<Locator | null> {
  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    const box = await locator.boundingBox();
    if (box && box.width > 1 && box.height > 1) return locator;
  } catch {
    /* 下一候选 */
  }
  return null;
}

/**
 * 在主文档与子 frame 中依次尝试 CSS；最后尝试 role=textbox。
 * @param overrideBudgetMs 不传则用 navigationTimeoutMs；轮询「搜索框再次出现」时用较短预算避免单次查找占满总超时。
 */
async function resolveSearchInput(
  page: Page,
  cfg: MeritcoPlaywrightConfig,
  overrideBudgetMs?: number,
): Promise<Locator> {
  /** SPA 可能在 goto 完成后再跳登录，避免空等 90s */
  assertNotLoginPage(page, "查找搜索框前");

  const budgetMs = overrideBudgetMs ?? cfg.navigationTimeoutMs;
  const t0 = Date.now();
  const candidates = buildSearchCandidates(cfg);

  const remaining = () => Math.max(0, budgetMs - (Date.now() - t0));

  for (const sel of candidates) {
    const left = remaining();
    if (left < 1500) break;
    const loc = page.locator(sel).first();
    const ok = await tryVisibleInput(loc, Math.min(12_000, left));
    if (ok) return ok;
  }

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    for (const sel of candidates) {
      const left = remaining();
      if (left < 1500) break;
      const loc = frame.locator(sel).first();
      const ok = await tryVisibleInput(loc, Math.min(8000, left));
      if (ok) return ok;
    }
  }

  const left = remaining();
  if (left > 2000) {
    const loc = page.getByRole("textbox").first();
    const ok = await tryVisibleInput(loc, Math.min(12_000, left));
    if (ok) return ok;
  }

  throw new Error(
    `在 ${budgetMs}ms 内未找到可用搜索输入框。请：1) meritco.playwright.json 配置 searchInputSelectors 或更新选择器；2) 设 MERITCO_PLAYWRIGHT_HEADLESS=0 弹出浏览器对照 DevTools 排查；3) 先执行 npm run meritco:profile 确认该 profile 登录有效。当前 URL：${page.url()}`,
  );
}

/** 统一读取搜索框当前文案（input/textarea 用 value，contenteditable 用 innerText），便于与本次 query 比较 */
async function readLocatorInputText(loc: Locator): Promise<string> {
  const raw = await loc.evaluate((el: Element) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value;
    }
    return (el as HTMLElement).innerText ?? "";
  });
  return String(raw)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 搜索框文案与用户 query 比较用：NFKC + 空白折叠，减少全角/隐式空白导致永不相等 */
function normalizeForSearchInputCompare(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 判定「框内当前文案」是否表示用户本次检索词已回到可编辑态（含产品展开的「查询词 = …」长串） */
function searchInputShowsUserQuery(curRaw: string, query: string, loose: boolean): boolean {
  const cur = normalizeForSearchInputCompare(curRaw);
  const q = normalizeForSearchInputCompare(query);
  if (!q) return false;
  if (cur === q) return true;
  if (!loose || q.length < 2) return false;
  return cur.includes(q);
}

/**
 * 久谦 bot：生成结束后搜索框会再次显示用户输入的查询。
 * 若过程中框内文案曾偏离 query，则一旦恢复为 query 即完成；若始终为 query（少数实现），则至少经过 searchInputQueryMatchMinMs 才接受，避免刚提交就返回。
 */
async function waitForSearchInputQueryComplete(
  page: Page,
  cfg: MeritcoPlaywrightConfig,
  query: string,
  budgetMs: number,
): Promise<void> {
  const q = query.trim();
  const loose = cfg.searchInputQueryLooseMatch !== false;
  const poll = cfg.searchInputQueryPollMs ?? 800;
  const minMs = cfg.searchInputQueryMatchMinMs ?? 4000;
  const t0 = Date.now();
  let sawMismatch = false;

  while (Date.now() - t0 < budgetMs) {
    assertNotLoginPage(page, "等待搜索框再次出现查询");
    const left = budgetMs - (Date.now() - t0);
    if (left < poll) break;

    let loc: Locator;
    try {
      loc = await resolveSearchInput(page, cfg, Math.min(12_000, left));
    } catch {
      await new Promise((r) => setTimeout(r, poll));
      continue;
    }

    let cur = "";
    try {
      cur = await readLocatorInputText(loc);
    } catch {
      await new Promise((r) => setTimeout(r, poll));
      continue;
    }

    const matches = searchInputShowsUserQuery(cur, query, loose);
    if (!matches) {
      sawMismatch = true;
    }
    const elapsed = Date.now() - t0;
    if (matches && (sawMismatch || elapsed >= minMs)) {
      return;
    }
    await new Promise((r) => setTimeout(r, poll));
  }

  throw new Error(
    `等待搜索框再次出现查询超时（${budgetMs}ms）。可检查：1) 登录态；2) searchInputSelector；3) 设 waitUntilSearchInputShowsQuery:false 回退正文稳定判定；4) 调大 generationTimeoutMs；5) 保持 searchInputQueryLooseMatch:true（默认）以匹配「查询词 = …」展开文案。`,
  );
}

/** 长报告常在可滚动容器内流式挂载，采 innerText 前把目标节点及祖先滚到底，尽量触发懒渲染并读全 */
async function scrollTextTargetChainToBottom(textTarget: Locator): Promise<void> {
  await textTarget
    .evaluate((el) => {
      const scrollOne = (n: HTMLElement) => {
        try {
          n.scrollTop = n.scrollHeight;
        } catch {
          /* ignore */
        }
      };
      let cur: HTMLElement | null = el as HTMLElement;
      for (let i = 0; i < 12 && cur; i++) {
        scrollOne(cur);
        cur = cur.parentElement;
      }
    })
    .catch(() => {
      /* 非 HTML 或跨域 iframe 时忽略 */
    });
}

/** 在克隆的根节点上移除若干子树后再读 innerText，用于去掉「深度思考」等独立 DOM 块（选择器相对采集根节点） */
async function readInnerTextWithDomStrips(textTarget: Locator, stripSelectors: string[]): Promise<string> {
  if (!stripSelectors.length) {
    return ((await textTarget.innerText()) ?? "").trim();
  }
  const raw = await textTarget.evaluate(
    (root, sels: string[]) => {
      const el = root as HTMLElement;
      const clone = el.cloneNode(true) as HTMLElement;
      for (const sel of sels) {
        if (!sel) continue;
        try {
          clone.querySelectorAll(sel).forEach((n) => n.remove());
        } catch {
          /* 非法选择器时跳过 */
        }
      }
      return clone.innerText ?? "";
    },
    stripSelectors,
  );
  return String(raw).trim();
}

/** 解析 Playwright storageState：优先 MERITCO_STORAGE_STATE；未设时若配置目录下 meritco-auth.json 存在且含 cookies 则自动使用 */
function resolvePlaywrightStorageState(): { storagePath: string; useStorage: boolean } {
  const storageRaw = process.env.MERITCO_STORAGE_STATE?.trim();
  const paths: string[] = [];
  if (storageRaw) paths.push(resolvePath(storageRaw));
  else {
    const def = join(resolveConfigDir(), "meritco-auth.json");
    if (existsSync(def)) paths.push(def);
  }

  for (const p of paths) {
    if (!existsSync(p)) {
      if (storageRaw) {
        console.error(`[jqmcp-playwright] MERITCO_STORAGE_STATE 文件不存在，回退 Cookie：${p}`);
      }
      continue;
    }
    try {
      const j = JSON.parse(readFileSync(p, "utf8")) as { cookies?: unknown[] };
      const n = Array.isArray(j.cookies) ? j.cookies.length : 0;
      if (n === 0) {
        console.error(
          `[jqmcp-playwright] ${p} 内 cookies 为空，不能代替登录。请在弹窗中**完成登录并进入 bot 页**后再关闭 codegen，或从已登录浏览器导出含会话的 Cookie 写入 MERITCO_COOKIE。`,
        );
        continue;
      }
      return { storagePath: p, useStorage: true };
    } catch (e) {
      console.error(`[jqmcp-playwright] 无法读取 storage：${p} — ${e instanceof Error ? e.message : e}`);
    }
  }
  return { storagePath: "", useStorage: false };
}

/** 若存在 meritco-auth.json / MERITCO_STORAGE_STATE，返回可读路径（不要求 cookies 非空；用于向 persistent context 注入 localStorage.token） */
function resolveMeritcoStorageJsonPathOptional(): string | null {
  const list: string[] = [];
  const storageRaw = process.env.MERITCO_STORAGE_STATE?.trim();
  if (storageRaw) list.push(resolvePath(storageRaw));
  const def = join(resolveConfigDir(), "meritco-auth.json");
  if (!list.includes(def)) list.push(def);
  for (const p of list) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** 持久化 profile 为登录真相时，默认勿用 auth.json 覆盖 localStorage（旧 token 会冲掉 profile 里新 token）。设 MERITCO_PERSIST_MERGE_AUTH_LOCALSTORAGE=1 恢复注入。 */
function shouldMergeAuthLocalStorageIntoPersistProfile(): boolean {
  const v = process.env.MERITCO_PERSIST_MERGE_AUTH_LOCALSTORAGE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/**
 * launchPersistentContext 不会自动读 storageState JSON；把其中 cookies + research 源 localStorage 写入当前 context，
 * 避免「profile 目录会话空、但 meritco-auth.json 里有 token」时 MCP 一直跳登录。
 */
async function mergeStorageStateJsonIntoPersistentContext(
  context: BrowserContext,
  cfg: MeritcoPlaywrightConfig,
  absPath: string,
): Promise<void> {
  let data: {
    cookies?: { name: string; value: string; domain: string; path: string; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Strict" | "Lax" | "None" }[];
    origins?: { origin?: string; localStorage?: { name: string; value: string }[] }[];
  };
  try {
    data = JSON.parse(readFileSync(absPath, "utf8")) as typeof data;
  } catch (e) {
    console.error(`[jqmcp-playwright] 无法读取合并用 storage：${absPath} — ${e instanceof Error ? e.message : e}`);
    return;
  }
  if (Array.isArray(data.cookies) && data.cookies.length > 0) {
    try {
      await context.addCookies(data.cookies);
      console.error(
        `[jqmcp-playwright] 持久化配置：已从 ${absPath} 合并 ${data.cookies.length} 条 Cookie（与 profile 目录叠加）。`,
      );
    } catch (e) {
      console.error(
        `[jqmcp-playwright] 合并 storage 内 Cookie 失败（将仍尝试 localStorage）：${e instanceof Error ? e.message : e}`,
      );
    }
  }
  const research = data.origins?.find((o) => o.origin?.includes("research.meritco-group.com"));
  const ls = research?.localStorage;
  if (!ls?.length) {
    return;
  }
  if (!shouldMergeAuthLocalStorageIntoPersistProfile()) {
    console.error(
      "[jqmcp-playwright] 持久化配置：已跳过 meritco-auth.json 的 localStorage 注入（避免覆盖 profile 内有效 token）。profile 空时设 MERITCO_PERSIST_MERGE_AUTH_LOCALSTORAGE=1，或重新 npm run meritco:profile。",
    );
    return;
  }
  let origin: string;
  try {
    origin = new URL(cfg.startUrl).origin;
  } catch {
    origin = "https://research.meritco-group.com";
  }
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(cfg.navigationTimeoutMs);
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: cfg.navigationTimeoutMs });
  await page.evaluate((entries: { name: string; value: string }[]) => {
    for (const { name, value } of entries) {
      try {
        localStorage.setItem(name, value);
      } catch {
        /* ignore */
      }
    }
  }, ls);
  console.error(
    `[jqmcp-playwright] 持久化配置：已注入 ${absPath} 中 research 源 ${ls.length} 条 localStorage（含 token），请重载页面路由后继续使用。`,
  );
}

/** 持久化用户目录：打开 research 根后从 localStorage.token 写回请求头，与页面内请求一致 */
async function syncExtraHttpHeadersFromResearchPage(page: Page, context: BrowserContext): Promise<void> {
  let token = process.env.MERITCO_TOKEN?.trim() ?? "";
  try {
    const ls = await page.evaluate(() => localStorage.getItem("token"));
    if (typeof ls === "string" && ls.trim()) token = ls.trim();
  } catch {
    /* 尚未导航到同源或页面未就绪 */
  }
  const headers: Record<string, string> = {};
  if (token) headers.Token = token;
  await context.setExtraHTTPHeaders(headers);
}

/** 可选：在持久化配置下仍合并 MERITCO_COOKIE / FILE，补 HttpOnly 等 */
async function mergeOptionalEnvCookies(context: BrowserContext, cfg: MeritcoPlaywrightConfig): Promise<void> {
  const cf = process.env.MERITCO_COOKIE_FILE?.trim();
  if (cf) {
    const abs = resolvePath(cf);
    if (existsSync(abs)) {
      const raw = readFileSync(abs, "utf8").trim().replace(/^\ufeff/, "").split(/\r?\n/)[0]!.trim();
      if (raw) {
        await context.addCookies(mergeCookieDomains(raw, cfg));
        console.error("[jqmcp-playwright] 已合并 MERITCO_COOKIE_FILE 中的 Cookie（持久化配置）");
      }
    }
  } else {
    const c = process.env.MERITCO_COOKIE?.trim();
    if (c) {
      await context.addCookies(mergeCookieDomains(c, cfg));
      console.error("[jqmcp-playwright] 已合并 MERITCO_COOKIE 环境变量（持久化配置）");
    }
  }
}

/**
 * 无头浏览器路径：注入 Cookie → 打开页面 → 输入搜索 → 等待正文稳定或完成节点出现。
 * 选择器在 meritco.playwright.json 中配置；支持多候选与内置回退。
 */
export async function runUniversalSearchPlaywright(query: string): Promise<string> {
  const path = resolvePlaywrightConfigPath();
  const cfg = loadPlaywrightConfig(path);
  const persistDir = resolveChromiumUserDataDirForPlaywright();

  if (persistDir) {
    const { headless: headlessPersist, logLine } = resolvePlaywrightHeadlessForUniversalSearch();
    console.error(`[jqmcp-playwright] headless 判定：${logLine}`);
    if (!headlessPersist) {
      console.error(
        "[jqmcp-playwright] 当前为有头模式：在 Cursor MCP 等无桌面环境中可能立刻崩溃；日常请去掉 MERITCO_PLAYWRIGHT_HEADLESS=0 以保持默认无头。",
      );
    }
    console.error(
      `[jqmcp-playwright] 使用持久 Chromium 用户目录（登录一次即可）：${persistDir}\n若尚未登录，请先执行：npm run meritco:profile`,
    );
    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(persistDir, {
        headless: headlessPersist,
        args: chromiumExtraLaunchArgs(),
        ...(cfg.userAgent?.trim() ? { userAgent: cfg.userAgent.trim() } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `启动持久化 Chromium 失败：${msg}\n\n` +
          "常见处理（Windows）：\n" +
          "1) **无桌面仍强制有头**：去掉 `MERITCO_PLAYWRIGHT_HEADLESS=0`，保持默认无头；若仍异常可试 `MERITCO_PLAYWRIGHT_DISABLE_GPU=1`。\n" +
          "2) **用户目录被占用**：关闭其它正在使用该 profile 的 Chromium 窗口（含未关的 meritco:profile）。\n" +
          "3) **杀毒/策略拦截** playwright 自带的 chromium.exe。\n" +
          "4) 重新执行 `npm run meritco:profile` 刷新该目录内登录态。\n" +
          "5) **并发**：避免同时对同一 profile 发起两次通用查询（会争用用户目录锁）。",
      );
    }
    try {
      const storageMerge = resolveMeritcoStorageJsonPathOptional();
      if (storageMerge) {
        await mergeStorageStateJsonIntoPersistentContext(context, cfg, storageMerge);
      } else {
        console.error(
          "[jqmcp-playwright] 未找到 meritco storage 合并源（MERITCO_STORAGE_STATE 或 meritco-auth.json）；仅依赖 profile 目录内登录态。",
        );
      }
      const page = context.pages()[0] ?? (await context.newPage());
      page.setDefaultTimeout(cfg.navigationTimeoutMs);
      return await executeMeritcoUniversalQuery(page, cfg, query, { syncTokenFromPageAfterOrigin: true });
    } finally {
      await context.close();
    }
  }

  const { storagePath, useStorage } = resolvePlaywrightStorageState();

  const { headless: headlessEphemeral, logLine: headlessLog } = resolvePlaywrightHeadlessForUniversalSearch();
  console.error(`[jqmcp-playwright] headless 判定：${headlessLog}`);

  const browser = await chromium.launch({
    headless: headlessEphemeral,
    args: chromiumExtraLaunchArgs(),
  });
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: extraHeadersWithStorageSync(useStorage ? storagePath : null, useStorage),
      ...(cfg.userAgent?.trim() ? { userAgent: cfg.userAgent.trim() } : {}),
      ...(useStorage ? { storageState: storagePath } : {}),
    });
    if (useStorage) {
      console.error(`[jqmcp-playwright] 已使用 storageState：${storagePath}`);
      /** storage 里往往只有非 HttpOnly 的 Cookie；合并 env 里的整段 Cookie 可补会话 */
      const cf = process.env.MERITCO_COOKIE_FILE?.trim();
      if (cf) {
        const abs = resolvePath(cf);
        if (existsSync(abs)) {
          const raw = readFileSync(abs, "utf8").trim().replace(/^\ufeff/, "").split(/\r?\n/)[0]!.trim();
          if (raw) {
            await context.addCookies(mergeCookieDomains(raw, cfg));
            console.error("[jqmcp-playwright] 已合并 MERITCO_COOKIE_FILE 中的 Cookie");
          }
        }
      } else {
        const c = process.env.MERITCO_COOKIE?.trim();
        if (c) {
          await context.addCookies(mergeCookieDomains(c, cfg));
          console.error("[jqmcp-playwright] 已合并 MERITCO_COOKIE 环境变量中的 Cookie");
        }
      }
    } else {
      const cookieHeader = requireMeritcoCookie();
      await context.addCookies(mergeCookieDomains(cookieHeader, cfg));
    }
    const page = await context.newPage();
    page.setDefaultTimeout(cfg.navigationTimeoutMs);
    return await executeMeritcoUniversalQuery(page, cfg, query, { syncTokenFromPageAfterOrigin: false });
  } finally {
    await browser.close();
  }
}

type ExecuteMeritcoOpts = { syncTokenFromPageAfterOrigin: boolean };

async function executeMeritcoUniversalQuery(
  page: Page,
  cfg: MeritcoPlaywrightConfig,
  query: string,
  opts: ExecuteMeritcoOpts,
): Promise<string> {
  // 先访问站点根，再进 bot，部分环境下更易带上会话（无效 Cookie 时仍会跳登录）
  let origin: string;
  try {
    origin = new URL(cfg.startUrl).origin;
  } catch {
    origin = "https://research.meritco-group.com";
  }
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: cfg.navigationTimeoutMs });
  if (opts.syncTokenFromPageAfterOrigin) {
    await syncExtraHttpHeadersFromResearchPage(page, page.context());
  }
  assertNotLoginPage(page, "访问站点根后");

  await page.goto(cfg.startUrl, { waitUntil: cfg.waitUntil ?? "domcontentloaded" });
  /** 前端路由可能稍后跳登录，短等再检一次 */
  await new Promise((r) => setTimeout(r, 1500));
  assertNotLoginPage(page, "打开 startUrl 后");

  const input = await resolveSearchInput(page, cfg);
  await input.fill(query);
  // bot 页 QueryInput 常为回车触发 search，非 type=submit 按钮
  if (cfg.submitWithEnter) {
    await input.press("Enter");
  } else {
    await page.locator(cfg.submitSelector!).click();
  }

  const pauseMs = cfg.afterSubmitPauseMs ?? 1200;
  await new Promise((r) => setTimeout(r, pauseMs));
  const dismiss = cfg.dismissAuxiliaryText?.trim();
  if (dismiss) {
    await page
      .getByText(dismiss, { exact: true })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {
        /* 无辅助搜索层时忽略 */
      });
  }

  /** 从提交后起算的总等待预算：搜索框、正文稳定等子阶段共享，避免各占满一整段 generationTimeoutMs */
  const genDeadline = Date.now() + cfg.generationTimeoutMs;
  const remGenMs = () => Math.max(0, genDeadline - Date.now());

  const bodyLocator = page.locator(cfg.bodySelector).first();
  await bodyLocator.waitFor({ state: "visible", timeout: remGenMs() });

  /** 实际参与「稳定判定 + 读 innerText」的节点；有 extractSelector 时只取红框报告正文，少带工具条文案 */
  let textTarget = bodyLocator;
  const inner = cfg.extractSelector?.trim();
  if (inner) {
    const scoped = bodyLocator.locator(inner).first();
    try {
      await scoped.waitFor({ state: "visible", timeout: Math.min(20_000, remGenMs()) });
      textTarget = scoped;
    } catch {
      console.error(
        "[jqmcp-playwright] extractSelector 在超时内未出现，回退为整块 bodySelector（可在 meritco.playwright.json 核对选择器）。",
      );
    }
  }

  if (cfg.doneSelector?.trim()) {
    await page.locator(cfg.doneSelector).first().waitFor({
      state: "visible",
      timeout: remGenMs(),
    });
  } else if (cfg.waitUntilSearchInputShowsQuery !== false) {
    /**
     * 先等搜索框再次出现 query（产品上的「可继续搜」态），
     * 再等正文 stable：框先恢复时流式正文常未写完，仅前者会「没出全」。
     */
    try {
      await waitForSearchInputQueryComplete(page, cfg, query, remGenMs());
    } catch (e) {
      /** 产品常把框内改成「查询词 = xxx（…）」；若仍不匹配或完成后清空输入框，此处可能超时 */
      if (cfg.searchInputQueryFallbackToBodyStable === false) {
        throw e;
      }
      let previewLen = 0;
      try {
        previewLen = ((await textTarget.innerText()) ?? "").trim().length;
      } catch {
        /* ignore */
      }
      const minL = cfg.minStableTextLength ?? 250;
      if (previewLen >= minL) {
        console.error(
          `[jqmcp-playwright] 搜索框完成信号超时，正文已有 ${previewLen} 字（≥${minL}），改按正文稳定结束。原因：${e instanceof Error ? e.message.split("\n")[0] : String(e)}`,
        );
      } else {
        throw e;
      }
    }
    await new Promise((r) => setTimeout(r, 600));
    if (cfg.waitForBodyStableAfterSearchInput !== false) {
      const left = remGenMs();
      if (left > 1500) {
        console.error("[jqmcp-playwright] 搜索框已恢复，继续等待正文稳定后再采集…");
        /** 框先恢复时正文仍常断续追加，此处略抬高「连续不变」门槛，减少中途停顿误判已写完 */
        const stableNeeded = Math.max(cfg.stableConsecutiveNeeded ?? 5, 8);
        await waitForStableText(
          textTarget,
          left,
          cfg.minStableTextLength ?? 250,
          cfg.stablePollMs ?? 2000,
          stableNeeded,
        );
      } else {
        console.error(
          `[jqmcp-playwright] 剩余仅 ${left}ms，跳过正文稳定等待；若结果截断请调大 generationTimeoutMs。`,
        );
      }
    }
  } else {
    await waitForStableText(
      textTarget,
      remGenMs(),
      cfg.minStableTextLength ?? 250,
      cfg.stablePollMs ?? 2000,
      cfg.stableConsecutiveNeeded ?? 5,
    );
  }

  if (cfg.scrollBodyToBottomBeforeRead !== false) {
    await scrollTextTargetChainToBottom(textTarget);
    /** 滚动后子树可能继续排版或懒加载，短歇再读 */
    await new Promise((r) => setTimeout(r, 900));
  }

  const stripSels = cfg.stripDomSelectors ?? [];
  const rawCombined = await readInnerTextWithDomStrips(textTarget, stripSels);
  if (stripSels.length > 0) {
    console.error(
      `[jqmcp-playwright] 已按 stripDomSelectors（${stripSels.length} 条）移除 DOM 子树后再读 innerText。`,
    );
  }

  let text = rawCombined;
  if (cfg.preferPlainAnswerSection !== false) {
    const sliced = preferAnswerBodyFromFlatText(rawCombined);
    if (sliced !== rawCombined.trim()) {
      console.error("[jqmcp-playwright] 已按「正文/正式回答」等标题截取，去掉前置深度思考等排版。");
    }
    text = sliced;
  }

  if (!text) {
    throw new Error("正文区域为空，请检查 bodySelector 是否指向正确容器");
  }
  return text;
}

/**
 * 连续若干次采样文本不变，视为生成结束（无 doneSelector 时的回退策略）。
 * 仅当文本长度 ≥ minLength 时才累计「不变」次数，避免生成初期空/短文误判完成。
 */
async function waitForStableText(
  locator: ReturnType<Page["locator"]>,
  budgetMs: number,
  minLength: number,
  pollMs: number,
  stableNeeded: number,
): Promise<void> {
  const start = Date.now();
  let prev: string | null = null;
  let sameStreak = 0;

  while (Date.now() - start < budgetMs) {
    const cur = ((await locator.innerText()) ?? "").trim();
    const longEnough = cur.length >= minLength;
    if (prev !== null && longEnough && cur === prev) {
      sameStreak += 1;
    } else {
      sameStreak = longEnough && cur === prev ? 1 : 0;
    }
    prev = cur;
    if (sameStreak >= stableNeeded) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(
    `等待正文稳定超时（要求正文至少 ${minLength} 字后再判定稳定）。可配置 doneSelector、调大 generationTimeoutMs / stableConsecutiveNeeded / stablePollMs，或降低 minStableTextLength。`,
  );
}
