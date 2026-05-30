/**
 * 品牌主张（久谦菜单：市场 > 品牌主张，URL 末段 `/report/identity`）—— Playwright 工具。
 *
 * 与其它 10 个工具不同：identity 页面是**两阶段交互**：
 *   阶段一  在顶部输入框输入关键词 + 回车 → 中间出账号联想列表；
 *   阶段二  点击其中一个账号 → 右侧才会生成该账号 / 品牌的「品牌主张」报告。
 *
 * 因此本工具暴露给 Agent 的接口也是两阶段：
 *   - 只传 query              → 返回候选账号 markdown 表格 + 二次调用提示；
 *   - 同时传 query + accountId → 直接定位 / 点击该 accountId 对应的账号，等右侧报告稳定后返回 prettify 文本。
 *
 * 不再依赖 meritco.identity.playwright.json（页面交互固定，没有可配置项）。
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

const START_URL = "https://research.meritco-group.com/report/identity";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0";
const LOG_PREFIX = "jqmcp-idt";

const NAV_TIMEOUT_MS = 90_000;
const SUGGEST_WAIT_MS = 25_000;
const REPORT_WAIT_MS = 600_000;
const REPORT_MIN_LEN = 400;
const REPORT_POLL_MS = 2_500;
const REPORT_STABLE_TICKS = 5;
const REPORT_SOFT_STABLE_MULT = 3;

const SEARCH_INPUT_SELECTORS = [
  "input[placeholder*='品牌']",
  "input[placeholder*='请输入']",
  "input[placeholder*='关键词']",
  "input[type='text']",
  "textarea[placeholder*='品牌']",
  "textarea[placeholder*='请输入']",
];

// 右侧报告区候选 selector；按经验顺序尝试，第一个能锁定到报告标题的就用。
// 报告区的标志：开头是 "关于<引号><品牌名><引号>的品牌主张分析"。
// 注意页面实际用的是 Unicode 全角弯引号 U+201C/U+201D（"…"），同时兜底支持 "…" 「…」 『…』 '…' 等多种写法。
const REPORT_HEADER_PATTERN = /关于[\s\S]{1,40}?的品牌主张分析/;

const EMPTY_REPORT_PHRASES = [
  "暂无相关数据",
  "暂无数据",
  "暂无相关结果",
  "暂无搜索结果",
];

export interface IdentityCandidate {
  /** 账号名，例如 "蜜雪冰城" / "蜜雪冰城招聘" */
  name: string;
  /** 账号 ID，例如 "1997MXBC"、"3631266488"、"fanxin123" */
  id: string;
  /** 粉丝数文本，例如 "1.5m" / "5.0k" / "10" */
  fans?: string;
  /** 互动量文本，例如 "6.3m" / "10k" / "0" */
  interactions?: string;
}

/* -------------------------------------------------------------------------- */
/* 候选列表解析：从 innerText 用正则切分                                       */
/* -------------------------------------------------------------------------- */

/**
 * 把 "搜索结果" 区域的纯文本拆解成候选条目。
 *
 * 经验观察的文本形态（多条会被换行 / 分隔符拼到一起）：
 *   "搜索结果蜜雪冰城ID 1997MXBC|粉丝 1.5m|互动量 6.3m蜜雪冰城招聘ID 3631266488|粉丝 5.0k|互动量 10k..."
 *
 * 策略：以 "ID + 字母数字串" 为锚点正向 split，再从前后片段里提取 name / fans / interactions。
 */
export function parseCandidates(rawText: string): IdentityCandidate[] {
  if (!rawText) return [];
  // 1) 标准化空白 / 全角竖线
  let text = rawText
    .replace(/[｜]/g, "|")
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/\r/g, "\n");
  // 2) bodySelector 抓的范围会把左侧菜单也圈进来；从 "搜索结果" 最后一次出现的位置开始截，
  //    可以稳定地丢掉左侧菜单 + 顶部 banner，只保留右侧/中间的搜索结果区。
  const lastIdx = text.lastIndexOf("搜索结果");
  if (lastIdx >= 0) {
    text = text.slice(lastIdx + "搜索结果".length);
  }
  // 3) 去除前后多余空白 / 换行
  text = text.replace(/^[\s\n]+/, "").replace(/\s+$/, "");

  // 按 "ID +alnum_" 锚点向前 split（保留 ID 段在每个 chunk 开头）
  const chunks = text.split(/(?=ID\s+[A-Za-z0-9_]+)/);
  if (chunks.length < 2) return [];

  const hits: IdentityCandidate[] = [];
  // 第 1 条候选的 name 兜底：chunks[0] 可能仍然带着前面的整段左侧菜单文本
  // （某些状态下 lastIndexOf("搜索结果") 没命中——例如 "搜索结果" 由 SVG / aria-label 渲染而非 text 节点），
  // 直接取最后一行非空文本作为 name。
  let pendingName = (() => {
    const lines = chunks[0]
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return lines[lines.length - 1] ?? "";
  })();

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const m = chunk.match(/^ID\s+([A-Za-z0-9_]+)([\s\S]*)$/);
    if (!m) continue;
    const id = m[1];
    const rest = m[2] ?? "";

    const fansMatch = rest.match(/粉丝\s*([\d.]+[kKmM]?)/);
    const interMatch = rest.match(/互动量\s*([\d.]+[kKmM]?)/);

    // 下一个 name 在 "互动量 xxx" 之后
    let nextName = "";
    if (interMatch && interMatch.index !== undefined) {
      const tail = rest.slice(interMatch.index + interMatch[0].length);
      nextName = tail
        .replace(/^[|\s]+/, "")
        .replace(/\s+$/, "")
        .split(/[\n\r]+/)[0]
        .trim();
    }

    const name = (pendingName || "").replace(/^[|\s]+/, "").trim();
    if (name && id) {
      hits.push({
        name,
        id,
        fans: fansMatch?.[1],
        interactions: interMatch?.[1],
      });
    }

    pendingName = nextName;
  }

  return hits;
}

function renderCandidatesTable(query: string, hits: IdentityCandidate[]): string {
  if (hits.length === 0) {
    return (
      `品牌主张 — 对 \`${query}\` 未找到任何候选账号。\n\n` +
      "可能原因：\n" +
      "1. 关键词写法不命中（试试加引号精准搜索、改简体 / 英文别名、去空格）；\n" +
      "2. 平台暂未收录该品牌的账号数据；\n" +
      "3. 该词不是品牌名（identity 报告按【品牌账号】归档）。"
    );
  }
  const header = "| # | 账号名 | accountId | 粉丝 | 互动量 |";
  const sep = "|---|---|---|---|---|";
  const rows = hits.map((h, i) =>
    `| ${i + 1} | ${h.name} | \`${h.id}\` | ${h.fans ?? "-"} | ${h.interactions ?? "-"} |`,
  );
  return [
    `品牌主张 — 对 \`${query}\` 找到 ${hits.length} 个候选账号。`,
    "",
    "**这是两阶段工具**：请挑一个 accountId，**再调用一次本工具**并把 `accountId` 传进来，才会返回该账号的品牌主张完整报告。",
    "",
    header,
    sep,
    ...rows,
    "",
    "**二次调用示例**：",
    "```",
    `meritco_brand_identity(query="${query}", accountId="${hits[0].id}")`,
    "```",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* 浏览器流程                                                                  */
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

async function findInput(page: Page): Promise<Locator> {
  const t0 = Date.now();
  for (const sel of SEARCH_INPUT_SELECTORS) {
    if (Date.now() - t0 > NAV_TIMEOUT_MS) break;
    const loc = page.locator(sel).first();
    try {
      await loc.waitFor({ state: "visible", timeout: 8_000 });
      const box = await loc.boundingBox();
      if (box && box.width > 1 && box.height > 1) return loc;
    } catch {
      /* 试下一候选 */
    }
  }
  throw new Error(
    `[${LOG_PREFIX}] 未在 ${NAV_TIMEOUT_MS}ms 内找到 identity 页输入框。当前 URL：${page.url()}`,
  );
}

/** 在主区域 innerText 里等待出现"搜索结果"标志后，把整段 innerText 返回。 */
async function waitForSuggestionText(page: Page): Promise<string> {
  const target = page.locator("#app, main").first();
  const start = Date.now();
  let lastText = "";
  while (Date.now() - start < SUGGEST_WAIT_MS) {
    const cur = ((await target.innerText().catch(() => "")) ?? "").trim();
    lastText = cur;
    // 中间联想区出现 "ID xxxx" 模式即认为已经联想出账号
    if (/ID\s+[A-Za-z0-9_]+[\s\S]{0,40}粉丝/.test(cur)) {
      return cur;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  // 超时仍未联想出 ID + 粉丝 模式 → 把当前 innerText 返回，让上层判断（可能是空态）
  return lastText;
}

/** 点击账号后，给后端报告生成器一个"启动窗口"。
 *  identity 页的报告通常 30s ~ 2min 才填充完毕，开头几秒会显示空模板（样本 0、文章 0），
 *  不预热的话稳定轮询会被空模板"骗"提前退出。 */
const REPORT_WARMUP_MS = 25_000;

const DEBUG = () => process.env.MERITCO_DEBUG_DEDUP?.trim() === "1";

/** 等待右侧报告标题出现，并轮询直到稳定。 */
async function waitForReportStable(page: Page): Promise<string> {
  const target = page.locator("#app, main").first();

  // 第一阶段：等 "关于xxx的品牌主张分析" 标题在文本里出现
  const headerStart = Date.now();
  let sawHeader = false;
  while (Date.now() - headerStart < SUGGEST_WAIT_MS) {
    const cur = ((await target.innerText().catch(() => "")) ?? "").trim();
    if (REPORT_HEADER_PATTERN.test(cur)) {
      sawHeader = true;
      break;
    }
    if (cur.length < 800 && EMPTY_REPORT_PHRASES.some((p) => cur.includes(p))) {
      throw new Error(
        `该账号的品牌主张报告为空：${EMPTY_REPORT_PHRASES.find((p) => cur.includes(p))}`,
      );
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  if (DEBUG()) {
    console.error(
      `[${LOG_PREFIX}] waitForReportStable: 第一阶段 sawHeader=${sawHeader} 耗时=${Date.now() - headerStart}ms`,
    );
  }

  // 第二阶段：预热 —— 强制睡 REPORT_WARMUP_MS，让后端生成器把空模板替换成真实报告。
  // 即便不预热，稳定轮询本身也会被开头的"样本=0 / 文章=0"空模板锁住、提前 softStreak 退出。
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
  throw new Error(
    `等待品牌主张报告稳定超时（要求 ≥${REPORT_MIN_LEN} 字后再判定）。`,
  );
}

async function clickCandidateById(page: Page, accountId: string): Promise<void> {
  // ID 在页面里的样式是 "ID 1997MXBC"。先用纯文本定位，再向上找可点击 row。
  const idLabel = `ID ${accountId}`;
  const idLocator = page.getByText(idLabel, { exact: true }).first();
  try {
    await idLocator.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    throw new Error(
      `未在联想结果里找到 accountId=\`${accountId}\`。请先不带 accountId 调用本工具拿到候选列表，再用列表里的 accountId 复制。`,
    );
  }
  // 点击文字所在的行容器。getByText 命中的可能是 <span>/<div>，点击它一般会冒泡到 row。
  // 用 click({ force: false }) + 兜底向上点击 parent。
  try {
    await idLocator.click({ timeout: 8_000 });
    return;
  } catch {
    // 兜底：在 DOM 层用 JS 触发最近的可点击祖先
    await idLocator
      .evaluate((el) => {
        let cur: HTMLElement | null = el as HTMLElement;
        for (let i = 0; i < 6 && cur; i++) {
          if (cur.getAttribute("role") === "button" || cur.tagName === "BUTTON" || cur.onclick) {
            cur.click();
            return;
          }
          cur = cur.parentElement;
        }
        // 实在找不到 button，就点最外层的 row
        let row: HTMLElement | null = el as HTMLElement;
        for (let i = 0; i < 4 && row?.parentElement; i++) row = row.parentElement;
        row?.click();
      })
      .catch(() => undefined);
  }
}

/* -------------------------------------------------------------------------- */
/* 对外入口                                                                    */
/* -------------------------------------------------------------------------- */

/** Node 服务里用来判断"工具是否可用"——这个工具不依赖配置文件，恒 true。 */
export function identityConfigPathIfExists(): string | null {
  return "__embedded__";
}

export interface RunBrandIdentityOptions {
  /** 二阶段调用：选定 accountId（在第一阶段返回的候选表里复制）；不传则只返回候选表。 */
  accountId?: string;
}

export async function runBrandIdentityAnalysis(
  query: string,
  opts: RunBrandIdentityOptions = {},
): Promise<string> {
  const q = (query ?? "").trim();
  if (!q) throw new Error("query 不能为空");
  const accountId = opts.accountId?.trim() || undefined;

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

    // 先访问站点根，再去 identity，便于 cookie / localStorage 生效
    let origin = "https://research.meritco-group.com";
    try {
      origin = new URL(START_URL).origin;
    } catch {
      /* fallback */
    }
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => undefined);
    assertNotLogin(page, "访问站点根后");

    await page.goto(START_URL, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
    assertNotLogin(page, "打开 identity 页后");

    const input = await findInput(page);
    await input.click({ timeout: 6_000 }).catch(() => undefined);
    await input.fill("");
    await input.fill(q);
    await input.press("Enter");

    // 等联想区出现 ID + 粉丝 模式
    const suggestText = await waitForSuggestionText(page);
    const candidates = parseCandidates(suggestText);

    if (!accountId) {
      console.error(
        `[${LOG_PREFIX}] 第一阶段（候选列表）命中 ${candidates.length} 条；返回候选表，等待 accountId 二次调用。`,
      );
      return renderCandidatesTable(q, candidates);
    }

    // 二阶段：必须能在候选里找到目标 ID（更友好的错误提示）
    const matched = candidates.find((c) => c.id === accountId);
    if (!matched) {
      // 也允许"虽然没解析到，但页面里其实存在" —— 直接尝试点击，失败再报错
      console.error(
        `[${LOG_PREFIX}] accountId=${accountId} 不在解析出的候选里（共 ${candidates.length} 条），仍尝试在页面里精确定位。`,
      );
    } else {
      console.error(
        `[${LOG_PREFIX}] 选中账号：${matched.name} (ID ${matched.id}) 粉丝=${matched.fans ?? "-"} 互动=${matched.interactions ?? "-"}`,
      );
    }

    await clickCandidateById(page, accountId);

    // 等右侧报告区生成稳定
    const rawReport = await waitForReportStable(page);

    // 仅保留 "关于xxx的品牌主张分析" 标题之后的部分（避免左侧菜单 / 中间联想列表混入）。
    // 注意页面用的是 Unicode 全角弯引号；REPORT_HEADER_PATTERN 已宽松匹配各种引号写法。
    const headerMatch = rawReport.match(REPORT_HEADER_PATTERN);
    const candidate = headerMatch
      ? rawReport.slice(rawReport.indexOf(headerMatch[0]))
      : rawReport;

    const dedup1 = dropRepeatedDraftPrefixes(candidate);
    const dedupedRaw = dropDuplicateOpeningLines(dedup1);
    if (process.env.MERITCO_DEBUG_DEDUP?.trim() === "1") {
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
