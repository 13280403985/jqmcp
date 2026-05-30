/**
 * 营销有效性（久谦菜单：营销 > 营销有效性 Beta，URL 末段 `/report/assessment`）
 * — Playwright 工具。
 *
 * 与其它 18 个工具不同：assessment 页面有**两个**输入框：
 *   - 左框 placeholder「请输入品牌」  → 参数 `brand`
 *   - 右框 placeholder「请输入对象」  → 参数 `target`（营销活动 / 事件 / 产品 / IP 等）
 * 两个都填上后回车一起提交，右侧才会生成营销有效性评估报告。
 *
 * 因此不能直接复用 `runMeritcoPageAnalysis`，需要专用的双输入框流程。
 */
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import { resolveChromiumUserDataDirForPlaywright } from "./meritcoChromiumProfile.js";
import {
  dropDuplicateOpeningLines,
  dropRepeatedDraftPrefixes,
  extraLaunchArgs,
  prettyPrintReport,
  resolveHeadless,
} from "./meritcoPageAnalysis.js";

const START_URL = "https://research.meritco-group.com/report/assessment";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0";
const LOG_PREFIX = "jqmcp-mka";

const NAV_TIMEOUT_MS = 90_000;
const REPORT_WAIT_MS = 600_000;
const REPORT_MIN_LEN = 400;
const REPORT_POLL_MS = 2_500;
const REPORT_STABLE_TICKS = 5;
const REPORT_SOFT_STABLE_MULT = 3;
const REPORT_WARMUP_MS = 25_000;

// 两个输入框的 placeholder 关键词（按优先级匹配）
const BRAND_INPUT_HINTS = ["品牌", "品类", "请输入品牌", "请输入品类"];
const TARGET_INPUT_HINTS = ["对象", "活动", "事件", "请输入对象"];

// 报告头部锚点
const REPORT_HEADER_PATTERN = /关于[\s\S]{1,40}?的(?:营销有效性|有效性|营销评估)分析/;

const EMPTY_REPORT_PHRASES = [
  "暂无相关数据",
  "暂无数据",
  "暂无相关结果",
  "暂无搜索结果",
];

const DEBUG = () => process.env.MERITCO_DEBUG_DEDUP?.trim() === "1";

/** 该工具不依赖配置文件，恒 true。供 server.ts 启动期判断"工具是否可用"。 */
export function assessmentConfigPathIfExists(): string | null {
  return "__embedded__";
}

export interface RunMarketingAssessmentOptions {
  /** 左输入框：被分析的品牌名（必填） */
  brand: string;
  /** 右输入框：被分析的营销对象——活动名 / 事件 / 产品 / IP 等（必填） */
  target: string;
}

/* -------------------------------------------------------------------------- */
/* 双输入框解析                                                                 */
/* -------------------------------------------------------------------------- */

function looksLikeLoginUrl(url: string): boolean {
  try {
    return /\/(login|signin)(\/|$)/.test(new URL(url).pathname.toLowerCase());
  } catch {
    return /\/login/i.test(url);
  }
}

function assertNotLogin(page: Page, phase: string): void {
  if (!looksLikeLoginUrl(page.url())) return;
  throw new Error(
    `[${LOG_PREFIX}] ${phase} 被跳转到登录页（${page.url()}）。请先在本机执行 npm run meritco:profile 登录久谦。`,
  );
}

/** 按 placeholder 关键词依次匹配；如果命中多个，按列表顺序返回。 */
async function findInputByHints(page: Page, hints: string[]): Promise<Locator | null> {
  for (const hint of hints) {
    for (const tag of ["input", "textarea"]) {
      const sel = `${tag}[placeholder*='${hint}']`;
      const loc = page.locator(sel).first();
      try {
        await loc.waitFor({ state: "visible", timeout: 4_000 });
        const box = await loc.boundingBox();
        if (box && box.width > 1 && box.height > 1) return loc;
      } catch {
        /* 试下一候选 */
      }
    }
  }
  return null;
}

/** 兜底：找页面里所有可见的 text 输入框，按文档顺序返回 [first, second]。 */
async function findInputsByOrder(page: Page): Promise<[Locator, Locator] | null> {
  const all = page.locator("input[type='text'], textarea");
  const count = await all.count();
  const visible: Locator[] = [];
  for (let i = 0; i < count && visible.length < 4; i++) {
    const loc = all.nth(i);
    try {
      const box = await loc.boundingBox();
      if (box && box.width > 1 && box.height > 1) visible.push(loc);
    } catch {
      /* skip */
    }
  }
  if (visible.length >= 2) return [visible[0], visible[1]];
  return null;
}

async function resolveTwoInputs(page: Page): Promise<[Locator, Locator]> {
  const brandLoc = await findInputByHints(page, BRAND_INPUT_HINTS);
  const targetLoc = await findInputByHints(page, TARGET_INPUT_HINTS);

  if (brandLoc && targetLoc) return [brandLoc, targetLoc];

  // 兜底：按文档顺序拿前两个可见输入框
  const ordered = await findInputsByOrder(page);
  if (!ordered) {
    throw new Error(
      `[${LOG_PREFIX}] 未在 ${NAV_TIMEOUT_MS}ms 内找到 assessment 页的两个输入框。当前 URL：${page.url()}`,
    );
  }
  return ordered;
}

/* -------------------------------------------------------------------------- */
/* 报告稳定等待                                                                 */
/* -------------------------------------------------------------------------- */

async function waitForReportStable(page: Page): Promise<string> {
  const target = page.locator("#app, main").first();

  // 第一阶段：等 "关于xxx的营销有效性分析" 标题出现（最长 30s）
  const headerStart = Date.now();
  let sawHeader = false;
  while (Date.now() - headerStart < 30_000) {
    const cur = ((await target.innerText().catch(() => "")) ?? "").trim();
    if (REPORT_HEADER_PATTERN.test(cur)) {
      sawHeader = true;
      break;
    }
    if (cur.length < 800 && EMPTY_REPORT_PHRASES.some((p) => cur.includes(p))) {
      throw new Error(
        `该组合的营销有效性报告为空：${EMPTY_REPORT_PHRASES.find((p) => cur.includes(p))}`,
      );
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  if (DEBUG()) {
    console.error(
      `[${LOG_PREFIX}] waitForReportStable: 第一阶段 sawHeader=${sawHeader} 耗时=${Date.now() - headerStart}ms`,
    );
  }

  // 第二阶段：预热窗口，让后端把空模板替换成真实报告
  if (DEBUG()) {
    console.error(`[${LOG_PREFIX}] waitForReportStable: 第二阶段 预热 sleep ${REPORT_WARMUP_MS}ms…`);
  }
  await new Promise((r) => setTimeout(r, REPORT_WARMUP_MS));

  // 第三阶段：稳定轮询
  const start = Date.now();
  let prev: string | null = null;
  let hardStreak = 0;
  let softStreak = 0;
  const softNeeded = REPORT_STABLE_TICKS * REPORT_SOFT_STABLE_MULT;
  let tick = 0;
  while (Date.now() - start < REPORT_WAIT_MS) {
    const cur = ((await target.innerText().catch(() => "")) ?? "").trim();
    if (prev !== null && cur === prev && cur.length > 0) softStreak += 1;
    else softStreak = 0;

    const longEnough = cur.length >= REPORT_MIN_LEN;
    if (prev !== null && longEnough && cur === prev) hardStreak += 1;
    else hardStreak = longEnough && cur === prev ? 1 : 0;

    if (DEBUG() && (tick % 4 === 0 || hardStreak > 0 || softStreak > 0)) {
      console.error(
        `[${LOG_PREFIX}] poll#${tick}: len=${cur.length} hard=${hardStreak}/${REPORT_STABLE_TICKS} soft=${softStreak}/${softNeeded}`,
      );
    }
    tick += 1;

    prev = cur;
    if (hardStreak >= REPORT_STABLE_TICKS) return cur;
    if (softStreak >= softNeeded) return cur;
    await new Promise((r) => setTimeout(r, REPORT_POLL_MS));
  }
  throw new Error(`等待营销有效性报告稳定超时（要求 ≥${REPORT_MIN_LEN} 字后再判定）。`);
}

/* -------------------------------------------------------------------------- */
/* 对外入口                                                                    */
/* -------------------------------------------------------------------------- */

export async function runMarketingAssessmentAnalysis(
  opts: RunMarketingAssessmentOptions,
): Promise<string> {
  const brand = (opts.brand ?? "").trim();
  const target = (opts.target ?? "").trim();
  if (!brand) throw new Error("brand 不能为空");
  if (!target) throw new Error("target 不能为空");

  const persistDir = resolveChromiumUserDataDirForPlaywright();
  const headless = resolveHeadless();
  const launchArgs = extraLaunchArgs();

  let context: BrowserContext;
  let usingPersistent = false;

  if (persistDir) {
    usingPersistent = true;
    console.error(`[${LOG_PREFIX}] 使用持久化 profile 目录：${persistDir}（headless=${headless}）`);
    try {
      context = await chromium.launchPersistentContext(persistDir, {
        headless,
        args: launchArgs,
        userAgent: USER_AGENT,
      });
    } catch (e) {
      throw new Error(
        `启动持久化 Chromium 失败：${e instanceof Error ? e.message : String(e)}\n` +
          "请检查 profile 目录是否被其它 Chromium 占用，或先执行 npm run meritco:profile。",
      );
    }
  } else {
    console.error(
      `[${LOG_PREFIX}] 未启用持久化（MERITCO_USE_PERSIST_PROFILE=0）；将打开无痕上下文，需自行登录。`,
    );
    const browser = await chromium.launch({ headless, args: launchArgs });
    context = await browser.newContext({ userAgent: USER_AGENT });
  }

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    let origin = "https://research.meritco-group.com";
    try {
      origin = new URL(START_URL).origin;
    } catch {
      /* fallback */
    }
    await page
      .goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS })
      .catch(() => undefined);
    assertNotLogin(page, "访问站点根后");

    await page.goto(START_URL, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
    assertNotLogin(page, "打开 assessment 页后");

    const [brandInput, targetInput] = await resolveTwoInputs(page);
    if (DEBUG()) {
      console.error(
        `[${LOG_PREFIX}] 找到两个输入框：填入 brand=${JSON.stringify(brand)}, target=${JSON.stringify(target)}`,
      );
    }

    // 顺序填两个框：先 brand 后 target，最后在 target 上按回车一起提交
    await brandInput.click({ timeout: 6_000 }).catch(() => undefined);
    await brandInput.fill("");
    await brandInput.fill(brand);

    await targetInput.click({ timeout: 6_000 }).catch(() => undefined);
    await targetInput.fill("");
    await targetInput.fill(target);

    await targetInput.press("Enter");

    // 等右侧报告稳定
    const rawReport = await waitForReportStable(page);

    // 截取从 "关于xxx的营销有效性分析" 开始的部分（避开左侧菜单 / 顶部 banner）
    const headerMatch = rawReport.match(REPORT_HEADER_PATTERN);
    const candidate = headerMatch
      ? rawReport.slice(rawReport.indexOf(headerMatch[0]))
      : rawReport;

    const dedup1 = dropRepeatedDraftPrefixes(candidate);
    const dedupedRaw = dropDuplicateOpeningLines(dedup1);
    if (DEBUG()) {
      console.error(
        `[${LOG_PREFIX}] dedup: raw=${candidate.length}  →  段级=${dedup1.length}  →  行级=${dedupedRaw.length}`,
      );
    }
    return prettyPrintReport(dedupedRaw);
  } finally {
    if (usingPersistent) {
      await context.close();
    } else {
      const browser = context.browser();
      await context.close();
      if (browser) await browser.close();
    }
  }
}
