/**
 * 久谦「页面分析」类工具的共享 Playwright 流程。
 *
 * 适用于所有走「单输入框 + 回车 + 等待右侧报告生成」的久谦页面（mec / sentiment / …）。
 * 每个具体工具只需要提供：
 *   1. 一份 JSON 配置（startUrl、selectors、等待参数等）
 *   2. 一个日志前缀（如 `jqmcp-mec`、`jqmcp-sat`）
 *   3. 解析配置路径的回调
 *
 * 共用同一持久化 Chromium profile（`MERITCO_CHROMIUM_USER_DATA` 或默认 `meritco-chromium-profile`），
 * 默认无头后台运行；与 `meritco_universal_search` 互不影响。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import { resolveConfigDir } from "./httpConfig.js";
import { resolveChromiumUserDataDirForPlaywright } from "./meritcoChromiumProfile.js";

/** 久谦「页面分析」类工具的 Playwright 契约 */
export interface MeritcoPageAnalysisConfig {
  startUrl: string;
  userAgent?: string;
  /** 输入框候选 CSS（自上而下尝试，找到第一个可见的） */
  searchInputSelectors: string[];
  /** true：填完直接按回车提交（默认 true） */
  submitWithEnter?: boolean;
  /** 配 submitSelector 时优先点击，覆盖 submitWithEnter */
  submitSelector?: string | null;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** 提交后稍候再开始等待结果区域，毫秒；默认 1500 */
  afterSubmitPauseMs?: number;
  /**
   * 提交后久谦会出现「辅助搜索」联想词面板（提交 / 跳过 / 重置）。
   * 若配置该按钮文本（如「跳过」或「提交」），将在面板出现后自动点击进入实际分析。
   * 不配则保持联想词面板，正文将仅为联想词内容。
   */
  dismissAuxiliaryText?: string | null;
  /** 等「跳过/提交」按钮可见的最长时间（ms），默认 30000；超时不报错，仍尝试读正文 */
  dismissAuxiliaryWaitMs?: number;
  /** 点击「跳过/提交」后，再额外等待多久才开始判定正文稳定（ms），默认 4000 */
  postDismissPauseMs?: number;
  navigationTimeoutMs: number;
  /** 等待结果稳定的总预算（ms） */
  generationTimeoutMs: number;
  /** 结果区域容器（外层）；若想只取报告子节点请用 extractSelector */
  bodySelector: string;
  /** 在 bodySelector 内进一步收窄到的报告节点；为空时直接读 bodySelector */
  extractSelector?: string | null;
  /** 视为生成完成前正文最少需要的字符数；默认 200 */
  minStableTextLength?: number;
  /** 采样间隔；默认 2000 */
  stablePollMs?: number;
  /** 连续多少次不变即视为生成结束；默认 5 */
  stableConsecutiveNeeded?: number;
  /** 读取前是否把目标节点链滚到底，缓解懒渲染；默认 true */
  scrollBodyToBottomBeforeRead?: boolean;
  /** 在克隆 DOM 上移除这些子树后再读 innerText（常用于剥离菜单/侧栏） */
  stripDomSelectors?: string[];
  /**
   * 文本级剥离：若正文中包含「搜索方式」「理论基础」等首页教程小节，
   * 命中其中任一条则把它（及上方内容）整体丢弃，只保留后续正文。
   */
  stripBeforeAny?: string[];
}

/** 工具配置子目录：root 没找到时退到此目录再查一次（向后兼容老布局把文件放根目录的情况）。 */
const PLAYWRIGHT_CONFIGS_SUBDIR = "playwright-configs";

/**
 * 统一查找逻辑：
 *   1) 环境变量覆盖（绝对路径，不再 fallback）
 *   2) 项目根目录（向后兼容老布局）
 *   3) <root>/playwright-configs/ 子目录（新布局）
 * 任一命中即返回；都不存在则返回 null。
 */
function findPageConfig(envVar: string, defaultFilename: string): string | null {
  const override = process.env[envVar]?.trim();
  if (override) {
    const p = resolvePath(override);
    return existsSync(p) ? p : null;
  }
  const dir = resolveConfigDir();
  const rootPath = resolvePath(dir, defaultFilename);
  if (existsSync(rootPath)) return rootPath;
  const subPath = resolvePath(dir, PLAYWRIGHT_CONFIGS_SUBDIR, defaultFilename);
  if (existsSync(subPath)) return subPath;
  return null;
}

/**
 * 在配置目录下定位指定文件名；存在则返回绝对路径，否则抛错。
 * 支持环境变量覆盖（如 MERITCO_CONSUMPTION_CONFIG / MERITCO_SATISFACTION_CONFIG）。
 */
export function resolvePageConfigPath(opts: {
  envVar: string;
  defaultFilename: string;
}): string {
  const p = findPageConfig(opts.envVar, opts.defaultFilename);
  if (!p) {
    throw new Error(
      `未找到页面分析配置 ${opts.defaultFilename}。请放到项目根或 ${PLAYWRIGHT_CONFIGS_SUBDIR}/ 子目录，或设置 ${opts.envVar}=<绝对路径>。`,
    );
  }
  return p;
}

export function pageConfigPathIfExists(opts: {
  envVar: string;
  defaultFilename: string;
}): string | null {
  return findPageConfig(opts.envVar, opts.defaultFilename);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function loadPageAnalysisConfig(path: string): MeritcoPageAnalysisConfig {
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (typeof data.startUrl !== "string" || !data.startUrl) {
    throw new Error(`${path} 缺少 startUrl`);
  }
  if (!isStringArray(data.searchInputSelectors) || data.searchInputSelectors.length === 0) {
    throw new Error(`${path} 缺少非空 searchInputSelectors 数组`);
  }
  if (typeof data.bodySelector !== "string" || !data.bodySelector) {
    throw new Error(`${path} 缺少 bodySelector`);
  }
  return {
    startUrl: data.startUrl,
    userAgent: typeof data.userAgent === "string" ? data.userAgent : undefined,
    searchInputSelectors: data.searchInputSelectors,
    submitWithEnter: data.submitWithEnter !== false,
    submitSelector:
      typeof data.submitSelector === "string" && data.submitSelector.trim()
        ? data.submitSelector
        : null,
    waitUntil:
      data.waitUntil === "load" ||
      data.waitUntil === "domcontentloaded" ||
      data.waitUntil === "networkidle" ||
      data.waitUntil === "commit"
        ? data.waitUntil
        : "load",
    afterSubmitPauseMs:
      typeof data.afterSubmitPauseMs === "number" ? data.afterSubmitPauseMs : 1500,
    dismissAuxiliaryText:
      typeof data.dismissAuxiliaryText === "string" && data.dismissAuxiliaryText.trim()
        ? data.dismissAuxiliaryText.trim()
        : null,
    dismissAuxiliaryWaitMs:
      typeof data.dismissAuxiliaryWaitMs === "number" ? data.dismissAuxiliaryWaitMs : 30_000,
    postDismissPauseMs:
      typeof data.postDismissPauseMs === "number" ? data.postDismissPauseMs : 4000,
    navigationTimeoutMs:
      typeof data.navigationTimeoutMs === "number" ? data.navigationTimeoutMs : 90_000,
    generationTimeoutMs:
      typeof data.generationTimeoutMs === "number" ? data.generationTimeoutMs : 300_000,
    bodySelector: data.bodySelector,
    extractSelector:
      typeof data.extractSelector === "string" && data.extractSelector.trim()
        ? data.extractSelector
        : null,
    minStableTextLength:
      typeof data.minStableTextLength === "number" ? data.minStableTextLength : 200,
    stablePollMs: typeof data.stablePollMs === "number" ? data.stablePollMs : 2000,
    stableConsecutiveNeeded:
      typeof data.stableConsecutiveNeeded === "number" ? data.stableConsecutiveNeeded : 5,
    scrollBodyToBottomBeforeRead: data.scrollBodyToBottomBeforeRead !== false,
    stripDomSelectors: isStringArray(data.stripDomSelectors) ? data.stripDomSelectors : [],
    stripBeforeAny: isStringArray(data.stripBeforeAny)
      ? data.stripBeforeAny
      : ["目标人群画像", "深度思考", "搜索方式", "理论基础", "概述"],
  };
}

/**
 * 久谦部分页面（如微场景）在生成过程中，会把流式"中间稿"一份接一份地累积进 DOM：
 * 稿 v1 是头部短稿，v2 包含 v1 并继续延伸，v3 又包含 v2…… innerText 全拿到后，
 * 整段头部会反复出现 N 次。`collapseProgressiveLineEchoes` 只能折叠行级渐进，
 * 抓不到这种全文级反复，需要先按"开头指纹"裁掉所有旧稿。
 *
 * 算法：拿文本开头去空白后的 80 字符作为指纹，找它在全文里最后一次出现的位置，
 * 截掉前面所有内容；反复迭代（处理嵌套），直到稳定或达到上限。
 */
export function dropRepeatedDraftPrefixes(text: string): string {
  let cur = text;
  for (let i = 0; i < 6; i++) {
    const trimmed = cur.replace(/^\s+/, "");
    if (trimmed.length < 200) break;
    // 同时尝试多个不同长度的指纹：80 字是首选（更独特、误伤少），
    // 但有些页面两份稿之间的开头差异在 80 字以内，导致 lastIndexOf 命中失败；
    // 80→60→40 递减，找到第一个能在文本中出现 ≥2 次的指纹就用它去重。
    let advanced = false;
    for (const fpLen of [80, 60, 40]) {
      if (trimmed.length < fpLen + 50) continue;
      const fingerprint = trimmed.slice(0, fpLen);
      const first = cur.indexOf(fingerprint);
      const last = cur.lastIndexOf(fingerprint);
      if (last > first && last > 0) {
        cur = cur.slice(last);
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }
  return cur;
}

/**
 * 行级去重兜底：把文本按 \n 切行，对每条 ≥ 50 字的长行取开头 30 字作为指纹；
 * 如果它出现在更早的某行开头，就把那条早行到当前行之间的所有内容当作"已被新版本覆盖"
 * 删除掉。能处理 dropRepeatedDraftPrefixes 抓不到的"行级渐进 + 不规则空行干扰"组合。
 */
export function dropDuplicateOpeningLines(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines.length < 3) return text;
  const minLineLen = 50;
  const prefixLen = 30;
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < minLineLen) {
      out.push(line);
      continue;
    }
    const prefix = trimmed.slice(0, prefixLen);
    let dupIdx = -1;
    for (let j = 0; j < out.length; j++) {
      const ot = out[j].trim();
      if (ot.length >= minLineLen && ot.startsWith(prefix)) {
        dupIdx = j;
        break;
      }
    }
    if (dupIdx >= 0) {
      out.length = dupIdx;
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * 久谦部分页面会把流式生成过程中的中间稿也留在 innerText 中：
 * 第 1 行是短稿，第 2 行包含第 1 行并继续变长，第 3 行又包含第 2 行……
 * 这会导致 stdout 看起来像"刷屏"。这里保留每组递增前缀中的最后一行。
 */
function collapseProgressiveLineEchoes(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const cur = line.trim();
    if (!cur) {
      out.push(line);
      continue;
    }

    const last = out[out.length - 1]?.trim();
    if (last && last.length >= 40 && cur.length > last.length && cur.startsWith(last)) {
      out[out.length - 1] = line;
    } else {
      out.push(line);
    }
  }

  return out.join("\n");
}

/**
 * 把"一行几万字"的报告拆成有结构的段落。
 *
 * mec 页面每个子板块多以 `（+）` 起头；sentiment 页面则多以「正面观点 / 负面观点 / 思考 / 建议」
 * 等纯文本标题起头。在这些标记前插换行后：
 * - 终端不再因单超长行被多次软换行刷屏（PowerShell + CJK 的渲染副作用）
 * - 给 LLM 的文本变成结构化段落，摘要质量更高
 *
 * 另把高频的「｜」分隔（关键词 - 频次 列表）打散为以「｜」开头的逐项行，便于阅读。
 */
export function prettyPrintReport(text: string): string {
  // 先把全文级反复的中间稿（微场景常见）裁掉，再做行级渐进折叠
  const dedup1 = dropRepeatedDraftPrefixes(text);
  let s = collapseProgressiveLineEchoes(dedup1)
    .replace(/\s*（\s*\+\s*）\s*/g, "\n\n（+） ")
    .replace(/\s*\(\s*\+\s*\)\s*/g, "\n\n(+) ")
    // 微场景 / market-micro-scene 页采用 CDST 六维度作为大节标题：
    // "中文｜English"。在它们前后插换行，并升级成 Markdown 二级标题。
    .replace(
      /\s*((?:微场景|物理环境|社交情境|时间维度|前置状态|任务目标)\s*｜\s*(?:Usage\s+Situation|Physical\s+Surroundings|Social\s+Surroundings|Temporal\s+Perspective|Antecedent\s+States|Task\s+Definition))\s*/gu,
      "\n\n## $1\n",
    )
    // sentiment 页小节没有「（+）」标记，直接用标题切段。
    .replace(/^\s*正面观点\s*/u, "## 正面观点\n")
    .replace(/\s*\[\s*([0-9]+(?:\.[0-9]+)?%)\s*\]\s*负面观点\s*/gu, "\n\n## 负面观点 [$1]\n")
    .replace(/\s*负面观点(?=负面情绪|：|:)/gu, "\n\n## 负面观点\n")
    .replace(/\s*思考(?=基于|：|:)/gu, "\n\n## 思考\n")
    .replace(/\s*建议建议\s*/gu, "\n\n## 建议\n")
    .replace(/\s*建议(?=采取|：|:)/gu, "\n\n## 建议\n")
    .replace(/\s*相关内容的阅读理解\s*/gu, "\n\n## 相关内容的阅读理解\n")
    .replace(/\s*知识图谱\|阅读理解\s*/gu, "\n\n## 知识图谱 / 阅读理解\n")
    // 产品价值定位 / 微场景里每个小节都形如 `（+） 引导词[ NN% ] 标题正文...`，
    // 把 `[ NN% ]` 整体前置一行并升格为三级标题，让标题与正文逻辑分层。
    // 注意：sentiment 页 `[N%] 负面观点` 已在上面单独处理，这里不会重复匹配
    // （前者已被改写成 `## 负面观点 [N%]`，文本里不再有 `[N%]` 紧跟"负面观点"）。
    .replace(/\s*\[\s*([0-9]+(?:\.[0-9]+)?%)\s*\]\s*/gu, "\n### [$1] ")
    // 品牌联想 / 部分页面的议题块形如 `<议题名> （ 26 ） 蜜雪冰城以...`，
    // 议题与描述在 innerText 里全连在一起（不像 identity 报告每个议题独占一段）。
    // 这里把「<议题名> （ N ）」升格成 `### <议题名>（N）` 三级标题 + 换行。
    // 约束：议题名 1~16 个字符、不含空白和括号，N 是 1~4 位整数。
    .replace(
      /(^|\s)([^\s()（）]{1,16}?)\s*（\s*(\d{1,4})\s*）(?=\s)/gu,
      "$1\n\n### $2（$3）\n",
    );

  // 把满意度页的编号建议拆成段落，避免 1/2/3/4/5 粘在上一段尾部。
  s = s.replace(/(?<![\d.])\s+([1-9]\d?\.)/gu, "\n\n$1");

  s = s
    .split("\n")
    .map((line) => {
      const bars = (line.match(/｜/g) ?? []).length;
      if (bars >= 3) return line.replace(/\s*｜\s*/g, "\n｜ ");
      return line;
    })
    .join("\n");

  return collapseProgressiveLineEchoes(s).trim();
}

/**
 * 文本级剥离：在 markers 中按顺序优先选择，第一个能命中且能切到"足够长后续"的就用它。
 * 设计目的：久谦报告页 innerText 头部固定包含「概述/理论基础/搜索方式」教程；分析报告
 * 真正开始于「目标人群画像」之类的小节标题。优先在分析锚点处切，退化到教程末尾锚点。
 */
function stripBeforeLastMarker(text: string, markers: string[]): string {
  if (!markers.length) return text;
  const minTailLen = 200;

  for (const m of markers) {
    if (!m) continue;
    const idx = text.lastIndexOf(m);
    if (idx < 0) continue;
    const tail = text.slice(idx).trim();
    if (tail.length < minTailLen) continue;
    return tail;
  }

  let cut = -1;
  for (const m of markers) {
    if (!m) continue;
    const idx = text.lastIndexOf(m);
    if (idx > cut) cut = idx;
  }
  if (cut < 0) return text;
  const lineEnd = text.indexOf("\n", cut);
  if (lineEnd < 0) return text.slice(cut).trim();
  return text.slice(lineEnd + 1).trim();
}

function looksLikeLoginUrl(url: string): boolean {
  try {
    return /\/(login|signin)(\/|$)/.test(new URL(url).pathname.toLowerCase());
  } catch {
    return /\/login/i.test(url);
  }
}

function assertNotLogin(page: Page, phase: string, logPrefix: string): void {
  if (!looksLikeLoginUrl(page.url())) return;
  throw new Error(
    `[${logPrefix}] ${phase} 被跳转到登录页（${page.url()}）。请先在本机执行 npm run meritco:profile 登录久谦。`,
  );
}

/** headless：默认无头；MERITCO_PLAYWRIGHT_HEADLESS=0 才弹窗（仅本机有桌面时） */
export function resolveHeadless(): boolean {
  const v = process.env.MERITCO_PLAYWRIGHT_HEADLESS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

export function extraLaunchArgs(): string[] {
  const out = ["--disable-dev-shm-usage"];
  if (process.env.MERITCO_PLAYWRIGHT_DISABLE_GPU?.trim() === "1") out.push("--disable-gpu");
  return out;
}

async function tryVisible(locator: Locator, timeoutMs: number): Promise<Locator | null> {
  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    const box = await locator.boundingBox();
    if (box && box.width > 1 && box.height > 1) return locator;
  } catch {
    /* 试下一候选 */
  }
  return null;
}

async function resolveInput(
  page: Page,
  cfg: MeritcoPageAnalysisConfig,
  logPrefix: string,
): Promise<Locator> {
  assertNotLogin(page, "查找输入框前", logPrefix);
  const budget = cfg.navigationTimeoutMs;
  const t0 = Date.now();
  const remaining = () => Math.max(0, budget - (Date.now() - t0));

  for (const sel of cfg.searchInputSelectors) {
    if (remaining() < 1500) break;
    const ok = await tryVisible(page.locator(sel).first(), Math.min(8000, remaining()));
    if (ok) return ok;
  }
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    for (const sel of cfg.searchInputSelectors) {
      if (remaining() < 1500) break;
      const ok = await tryVisible(frame.locator(sel).first(), Math.min(6000, remaining()));
      if (ok) return ok;
    }
  }
  if (remaining() > 1500) {
    const ok = await tryVisible(page.getByRole("textbox").first(), Math.min(8000, remaining()));
    if (ok) return ok;
  }
  throw new Error(
    `在 ${budget}ms 内未找到 [${logPrefix}] 输入框。请：1) 在配置 JSON 里补全 searchInputSelectors；2) 设 MERITCO_PLAYWRIGHT_HEADLESS=0 对照 DevTools 排查；3) 确认 profile 已登录。当前 URL：${page.url()}`,
  );
}

async function scrollChainToBottom(target: Locator): Promise<void> {
  await target
    .evaluate((el) => {
      let cur: HTMLElement | null = el as HTMLElement;
      for (let i = 0; i < 12 && cur; i++) {
        try {
          cur.scrollTop = cur.scrollHeight;
        } catch {
          /* ignore */
        }
        cur = cur.parentElement;
      }
    })
    .catch(() => {
      /* ignore */
    });
}

export async function readInnerTextWithStrip(target: Locator, stripSelectors: string[]): Promise<string> {
  if (!stripSelectors.length) {
    return ((await target.innerText()) ?? "").trim();
  }
  const raw = await target.evaluate(
    (root, sels: string[]) => {
      const clone = (root as HTMLElement).cloneNode(true) as HTMLElement;
      for (const sel of sels) {
        if (!sel) continue;
        try {
          clone.querySelectorAll(sel).forEach((n) => n.remove());
        } catch {
          /* 非法选择器跳过 */
        }
      }
      return clone.innerText ?? "";
    },
    stripSelectors,
  );
  return String(raw).trim();
}

/**
 * 命中以下任一短语即认为页面是"空态"——后端没数据 / 关键词不在该报告的数据集里。
 * 注意：必须是页面在该词上"几乎只有这句话"才算空态，避免长报告里偶尔提到这些词被误判。
 */
const EMPTY_STATE_PHRASES = [
  "暂无相关数据",
  "暂无数据",
  "暂无相关结果",
  "暂无搜索结果",
  "无相关数据",
  "无相关结果",
  "无搜索结果",
  "没有找到相关",
  "没有相关数据",
  "没有相关结果",
  "未找到相关",
  "没有匹配的数据",
];

/**
 * 久谦后端在样本量不足 / 限流 / 模型负载时会**主动中止**报告生成。
 * 命中以下短语任一即认为是"中止"状态——内容是不完整的部分报告，应在头部给 Agent 警告。
 * 与 EMPTY_STATE_PHRASES 不同的是，中止状态通常**已有部分内容**（成百上千字），
 * 不能仅按"短文本"识别，要直接命中关键短语；并且不抛错、不替换正文，只是 prepend 警告头。
 */
const ABORT_STATE_PHRASES = [
  "生成概括中止",
  "正在分析中止",
  "分析已中止",
  "生成已中止",
  "报告生成中止",
  "分析中止",
];

function detectAbortPhrase(text: string): string | null {
  if (!text) return null;
  // 中止状态文案通常紧跟标题出现在报告开头，因此只在前 800 字内查找，
  // 避免正文里偶发提到「分析中止」之类的语句被误判。
  const head = text.slice(0, 800);
  for (const phrase of ABORT_STATE_PHRASES) {
    if (head.includes(phrase)) return phrase;
  }
  return null;
}

/** 用唯一前缀让外层能可靠识别这是"空态"而不是真正的异常。 */
const EMPTY_STATE_ERROR_TAG = "__JQMCP_EMPTY_STATE__:";

function detectEmptyStatePhrase(text: string): string | null {
  if (!text) return null;
  // 真正的空态页面通常很短：留 800 字裕度（覆盖一些站点侧的提示语 + 面包屑等），
  // 同时避开长报告内偶发提到的同名短语。
  if (text.length > 800) return null;
  for (const phrase of EMPTY_STATE_PHRASES) {
    if (text.includes(phrase)) return phrase;
  }
  return null;
}

async function waitStableText(
  target: Locator,
  budgetMs: number,
  minLength: number,
  pollMs: number,
  stableNeeded: number,
): Promise<void> {
  const start = Date.now();
  let prev: string | null = null;
  // "硬稳定"：达到 minLength 且连续 stableNeeded 次相同 → 视为达标退出
  let hardStreak = 0;
  // "软稳定"：哪怕没达到 minLength，只要连续 stableNeeded * 3 次完全不变，
  // 说明页面已经渲染稳定（报告本身可能就是短的，或者只剩"暂无数据"这类空态），
  // 直接退出，避免再死等到 generationTimeoutMs（默认 10 分钟）。
  let softStreak = 0;
  const softNeeded = stableNeeded * 3;
  // 空态需要连续命中 2 次再退出，避开"加载中→真正长文"过渡帧的误判。
  let emptyStreak = 0;
  let lastEmptyPhrase: string | null = null;
  while (Date.now() - start < budgetMs) {
    const cur = ((await target.innerText()) ?? "").trim();

    const emptyPhrase = detectEmptyStatePhrase(cur);
    if (emptyPhrase) {
      emptyStreak += 1;
      lastEmptyPhrase = emptyPhrase;
      if (emptyStreak >= 2) {
        throw new Error(`${EMPTY_STATE_ERROR_TAG}${emptyPhrase}`);
      }
    } else {
      emptyStreak = 0;
    }

    if (prev !== null && cur === prev && cur.length > 0) {
      softStreak += 1;
    } else {
      softStreak = 0;
    }

    const longEnough = cur.length >= minLength;
    if (prev !== null && longEnough && cur === prev) {
      hardStreak += 1;
    } else {
      hardStreak = longEnough && cur === prev ? 1 : 0;
    }
    prev = cur;
    if (hardStreak >= stableNeeded) return;
    if (softStreak >= softNeeded) return; // 软停止：内容长时间未变即接受
    await new Promise((r) => setTimeout(r, pollMs));
  }
  // 超时但最后一次也是空态文案 → 仍当作空态返回（页面只是没渲染稳定信号）
  if (lastEmptyPhrase) {
    throw new Error(`${EMPTY_STATE_ERROR_TAG}${lastEmptyPhrase}`);
  }
  throw new Error(
    `等待报告正文稳定超时（要求 ≥${minLength} 字后再判定）。可调大 generationTimeoutMs 或降低 minStableTextLength。`,
  );
}

/**
 * 通用入口：按 cfg 在指定页面提交 query，等待结果稳定后返回 prettify 过的正文文本。
 *
 * @param query  用户问题/检索词
 * @param opts.configPath  loadPageAnalysisConfig 能读到的配置文件绝对路径
 * @param opts.logPrefix   写入 stderr 的日志前缀，便于区分多工具并发输出（如 "jqmcp-mec"）
 */
export async function runMeritcoPageAnalysis(
  query: string,
  opts: { configPath: string; logPrefix: string },
): Promise<string> {
  const q = (query ?? "").trim();
  if (!q) throw new Error("query 不能为空");

  const cfg = loadPageAnalysisConfig(opts.configPath);
  const persistDir = resolveChromiumUserDataDirForPlaywright();
  const headless = resolveHeadless();
  const launchArgs = extraLaunchArgs();
  const logPrefix = opts.logPrefix;

  let context: BrowserContext;
  let usingPersistent = false;

  if (persistDir) {
    usingPersistent = true;
    console.error(`[${logPrefix}] 使用持久化 profile 目录：${persistDir}（headless=${headless}）`);
    try {
      context = await chromium.launchPersistentContext(persistDir, {
        headless,
        args: launchArgs,
        ...(cfg.userAgent?.trim() ? { userAgent: cfg.userAgent.trim() } : {}),
      });
    } catch (e) {
      throw new Error(
        `启动持久化 Chromium 失败：${e instanceof Error ? e.message : String(e)}\n` +
          "请检查 profile 目录是否被其它 Chromium 占用，或先执行 npm run meritco:profile。",
      );
    }
  } else {
    console.error(
      `[${logPrefix}] 未启用持久化（MERITCO_USE_PERSIST_PROFILE=0）；将打开无痕上下文，需自行登录。`,
    );
    const browser = await chromium.launch({ headless, args: launchArgs });
    context = await browser.newContext(
      cfg.userAgent?.trim() ? { userAgent: cfg.userAgent.trim() } : undefined,
    );
  }

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(cfg.navigationTimeoutMs);

    let origin: string;
    try {
      origin = new URL(cfg.startUrl).origin;
    } catch {
      origin = "https://research.meritco-group.com";
    }
    await page.goto(`${origin}/`, {
      waitUntil: "domcontentloaded",
      timeout: cfg.navigationTimeoutMs,
    });
    assertNotLogin(page, "访问站点根后", logPrefix);

    await page.goto(cfg.startUrl, { waitUntil: cfg.waitUntil ?? "load" });
    await new Promise((r) => setTimeout(r, 1200));
    assertNotLogin(page, "打开 startUrl 后", logPrefix);

    const input = await resolveInput(page, cfg, logPrefix);
    await input.click({ delay: 30 }).catch(() => {
      /* contenteditable 等不可 click 时忽略 */
    });
    await input.fill(q);

    if (cfg.submitSelector) {
      await page.locator(cfg.submitSelector).first().click({ timeout: 5000 });
    } else if (cfg.submitWithEnter !== false) {
      await input.press("Enter");
    }

    await new Promise((r) => setTimeout(r, cfg.afterSubmitPauseMs ?? 1500));

    const dismissText = cfg.dismissAuxiliaryText?.trim();
    if (dismissText) {
      const waitMs = cfg.dismissAuxiliaryWaitMs ?? 30_000;
      console.error(`[${logPrefix}] 等待并点击「${dismissText}」（最长 ${waitMs}ms）…`);
      const clicked = await page
        .getByText(dismissText, { exact: true })
        .first()
        .click({ timeout: waitMs })
        .then(() => true)
        .catch(() => false);
      if (clicked) {
        console.error(`[${logPrefix}] 已点击「${dismissText}」，进入分析阶段。`);
      } else {
        console.error(
          `[${logPrefix}] 未点到「${dismissText}」（按钮可能未出现），将继续尝试读取正文，可能仅是联想词。`,
        );
      }
      await new Promise((r) => setTimeout(r, cfg.postDismissPauseMs ?? 4000));
    }

    const bodyLocator = page.locator(cfg.bodySelector).first();
    await bodyLocator.waitFor({ state: "visible", timeout: cfg.generationTimeoutMs });

    let textTarget = bodyLocator;
    const inner = cfg.extractSelector?.trim();
    if (inner) {
      const scoped = bodyLocator.locator(inner).first();
      try {
        await scoped.waitFor({
          state: "visible",
          timeout: Math.min(20_000, cfg.generationTimeoutMs),
        });
        textTarget = scoped;
      } catch {
        console.error(
          `[${logPrefix}] extractSelector 未在超时内出现，回退使用 bodySelector 整块文本。`,
        );
      }
    }

    try {
      await waitStableText(
        textTarget,
        cfg.generationTimeoutMs,
        cfg.minStableTextLength ?? 200,
        cfg.stablePollMs ?? 2000,
        cfg.stableConsecutiveNeeded ?? 5,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 空态：页面明确返回"暂无相关数据"等空态文案，转成对 Agent 友好的提示文本而不是异常
      if (msg.startsWith(EMPTY_STATE_ERROR_TAG)) {
        const phrase = msg.slice(EMPTY_STATE_ERROR_TAG.length);
        console.error(
          `[${logPrefix}] 命中空态：「${phrase}」（页面对该关键词无数据）。`,
        );
        return (
          `该报告页对 \`${q}\` ${phrase}。\n\n` +
          "可能原因：\n" +
          "1. 关键词颗粒度与该报告不匹配（例如本工具按【品牌】归档，但传入的是【车型/SKU】或【概念词】），换成对应层级的关键词再试；\n" +
          "2. 平台暂未收录该词的相关数据；\n" +
          "3. 写法导致未命中，可尝试加引号精准搜索、改简体/英文别名、或去掉空格。"
        );
      }
      throw e;
    }

    if (cfg.scrollBodyToBottomBeforeRead !== false) {
      await scrollChainToBottom(textTarget);
      await new Promise((r) => setTimeout(r, 800));
    }

    const raw = await readInnerTextWithStrip(textTarget, cfg.stripDomSelectors ?? []);
    if (!raw) {
      throw new Error(
        "报告正文为空：请检查 bodySelector 或 extractSelector 是否指向正确容器。",
      );
    }
    // 关键：先在原始 raw 上做段级 + 行级双重去重（裁掉流式生成累积下来的所有中间稿），
    // 再交给 stripBeforeLastMarker 处理；否则 stripBefore 可能误命中中间稿
    // 里的关键词，把开头指纹打散，使 prettyPrintReport 里的段级去重失效。
    const dedup1 = dropRepeatedDraftPrefixes(raw);
    const dedupedRaw = dropDuplicateOpeningLines(dedup1);
    if (process.env.MERITCO_DEBUG_DEDUP?.trim() === "1") {
      console.error(
        `[${logPrefix}] dedup: raw=${raw.length}  →  段级=${dedup1.length}  →  行级=${dedupedRaw.length}`,
      );
    }
    const stripped = stripBeforeLastMarker(dedupedRaw, cfg.stripBeforeAny ?? []);
    const final = stripped || dedupedRaw;
    const pretty = prettyPrintReport(final);
    // 久谦后端在样本量不足 / 限流 / 模型负载时会主动中止报告生成，页面正文会出现
    // 「生成概括中止」「正在分析中止」之类的状态文案。这种情况下工具行为本身正常，
    // 只是内容不完整 —— 在返回头部加一条警告，让 Agent 明确知道结果是被中止的，
    // 而不是把残缺报告当成完整报告呈现给用户。
    const abortPhrase = detectAbortPhrase(pretty);
    if (abortPhrase) {
      console.error(`[${logPrefix}] 命中中止状态：「${abortPhrase}」（报告生成被平台主动中止）。`);
      return (
        `> ⚠️ 久谦平台对该关键词「${q}」的报告生成被中止（页面提示：「${abortPhrase}」）。\n` +
        `> 可能原因：样本量不足 / 平台限流 / 模型负载。以下是中止前已生成的部分内容，建议换更主流关键词或稍后重试。\n\n` +
        pretty
      );
    }
    return pretty;
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
