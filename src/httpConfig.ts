import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getByPath } from "./jsonPath.js";

/** 完成态：equals 与 in 二选一（字符串都会与接口返回值 String() 后比较） */
export interface CompletedWhen {
  path: string;
  equals?: string;
  /** 任一匹配即视为完成，例如 ["done","SUCCESS","2"] */
  in?: string[];
}

/** HTTP 模式下的契约配置（由抓包结果填写） */
export interface MeritcoHttpConfig {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  createTask: {
    /** 支持占位符 {{query}}，例如 GET `/search?q={{query}}` */
    path: string;
    method: "GET" | "POST" | "PUT" | "PATCH";
    body?: unknown;
    /**
     * poll：首包只拿 taskId，再轮询 poll；
     * extract：无轮询，直接从首包用 extractBody.path 取正文（同步接口或首包即全文）。
     */
    afterCreate?: "poll" | "extract";
    /**
     * 首包响应里任务/会话 id 的点号路径；可为字符串或按顺序尝试的数组。
     * 均可省略：将在常见字段名上自动探测（traceId、requestId、conversationId 等）。
     */
    responseTaskIdPath?: string | string[];
    /** 仅 afterCreate=extract 时可选：若填写则首包必须先满足完成态，否则报错 */
    completedWhen?: CompletedWhen;
    /**
     * 首包在 extractBody.path 下无正文（如 result 为 []）时，改用 poll 轮询。
     * 需配置 poll；responseTaskIdPath 可省略，将自动探测 id。
     */
    pollIfExtractEmpty?: boolean;
    /**
     * 占位符替换后，将这些键的值从数字字符串转为 JSON 数字（如 conversationId）。
     */
    bodyNumericFields?: string[];
  };
  /** afterCreate 为 poll 时必填；extract + pollIfExtractEmpty 时也要填 */
  poll?: {
    /** 支持 {{taskId}}、{{query}}、{{traceId}}（与首包同源）；sameAsCreate 时可与 createTask.path 填成一致（校验用） */
    pathTemplate: string;
    method?: "GET" | "POST" | "PUT" | "PATCH";
    body?: unknown;
    intervalMs: number;
    maxAttempts: number;
    /**
     * 为 true 时：不读 taskId，每次轮询发送与 createTask 完全相同的 URL/方法/Body（靠 Cookie/Session 关联），
     * 直到 untilBodyReady 解析出正文。适合首包仅有 code/message/result:[]、无会话 id 的接口。
     */
    sameAsCreate?: boolean;
    /**
     * 为 true 时：每次轮询响应尝试从 extractBody 解析正文，解析成功且非空即结束（适合 result 由 [] 变为有内容）。
     * 与 completedWhen 二选一：untilBodyReady 为 true 时不要求 completedWhen。
     */
    untilBodyReady?: boolean;
    completedWhen?: CompletedWhen;
  };
  /**
   * path 指向正文字段；flexible 时若该节点为对象，会尝试常见子键（content/text/markdown 等）。
   * auxiliaryAsResult：为 true 时，smartWords/get 返回的 type/words 联想结构直接格式化为文本返回（与页面「辅助搜索」同源），不轮询长文。
   * asJson：为 true 时，path 所指为对象或数组则直接 JSON.stringify（缩进 2），用于 history/get 等列表接口。
   */
  extractBody: {
    path: string;
    flexible?: boolean;
    auxiliaryAsResult?: boolean;
    asJson?: boolean;
  };
}

export interface MeritcoPlaywrightConfig {
  startUrl: string;
  cookieDomain: string;
  cookiePath: string;
  /** 主选择器；可与 searchInputSelectors 并用，按顺序优先尝试 */
  searchInputSelector?: string;
  /** 额外候选 CSS，匹配失败时依次尝试（应对 placeholder/DOM 改版） */
  searchInputSelectors?: string[];
  /**
   * 点击提交；与 submitWithEnter 二选一。
   * 通用查询 bot 页多为输入框回车触发 search，可设 submitWithEnter:true 并省略本字段。
   */
  submitSelector?: string;
  /** 为 true 时在搜索框 fill 后按 Enter（对齐 /report/custom/bot 的 QueryInput） */
  submitWithEnter?: boolean;
  /** 正文外层容器（先等其出现；侧栏、顶栏一般不在此节点内） */
  bodySelector: string;
  /**
   * 可选：相对 bodySelector 内更窄的区域，只读红框报告正文（与 DevTools 对该区域「复制 selector」一致）。
   * 不填则整段 bodySelector 的 innerText 作为结果。
   */
  extractSelector?: string;
  /**
   * 为 true（默认）：若 innerText 中出现独立标题行「正文」「报告正文」「正式回答」「最终回答」等，
   * 只返回该标题之后内容，用于去掉前置「深度思考」等（纯文本启发式；未匹配则返回全文）。
   */
  preferPlainAnswerSection?: boolean;
  /**
   * 相对当前采集根节点（与 extractSelector 同源）在克隆 DOM 上 querySelectorAll 后移除再取 innerText。
   * 在 DevTools 中对「深度思考」外层复制**相对该根**的子选择器，例如 `.xxx-panel`。
   */
  stripDomSelectors?: string[];
  /** 可选：若页面有明确「完成」标记，优先等待该节点 */
  doneSelector?: string;
  /**
   * 为 true（默认）且无 doneSelector 时：以「搜索框再次出现本次查询内容」作为生成结束信号（久谦 bot 常见交互）。
   * 为 false 时回退为仅正文 stable 判定。
   */
  waitUntilSearchInputShowsQuery?: boolean;
  /** 若生成过程中搜索框从未清空/变化，至少经过此毫秒后才接受「框内已是查询」为完成，避免提交瞬间误判。默认 4000 */
  searchInputQueryMatchMinMs?: number;
  /** 轮询搜索框文案间隔（毫秒）。默认 800 */
  searchInputQueryPollMs?: number;
  /**
   * 为 true（默认）：除「框内全文等于 query」外，若规范化后的框内文案**包含**用户 query（如「查询词 = 苹果（…）」），也视为完成。
   */
  searchInputQueryLooseMatch?: boolean;
  /**
   * 为 true（默认）：若「等搜索框再现 query」整段超时，但正文已 ≥ minStableTextLength，则记录日志并改按正文 stable 结束，避免产品改 UI 时卡满 generationTimeoutMs。
   */
  searchInputQueryFallbackToBodyStable?: boolean;
  /**
   * 为 true（默认）：在「搜索框再次出现 query」之后，继续在剩余 generation 时间内等待正文 innerText 稳定再采集。
   * 否则仅依赖搜索框信号，正文可能仍在流式追加导致「没出全」。
   */
  waitForBodyStableAfterSearchInput?: boolean;
  navigationTimeoutMs: number;
  generationTimeoutMs: number;
  /** page.goto 的 waitUntil，默认 domcontentloaded */
  waitUntil?: "domcontentloaded" | "load" | "networkidle";
  /**
   * 提交后若出现「辅助搜索」等层，点此文案（如 跳过）；找不到则忽略。
   */
  dismissAuxiliaryText?: string;
  /** 正文长度 ≥ 此值时才参与「连续若干次文本不变」判定，避免空壳即结束。默认 250 */
  minStableTextLength?: number;
  /**
   * 无 doneSelector 时：每隔 stablePollMs 采样 innerText，连续 stableConsecutiveNeeded 次相同且长度 ≥ minStableTextLength 即视为生成结束。
   * 流式回答若中途 DOM 暂停更新，过小会误判「已写完」；可与调大 minStableTextLength 联用。
   */
  stablePollMs?: number;
  stableConsecutiveNeeded?: number;
  /**
   * 为 true（默认）：最终读取 innerText 前将正文节点及其祖先滚到最底，减少可滚动区内懒渲染/未进入布局树导致的截断。
   */
  scrollBodyToBottomBeforeRead?: boolean;
  /** 提交后稍候再点 dismiss，毫秒。默认 1200 */
  afterSubmitPauseMs?: number;
  /** 历史字段：`runUniversalSearchPlaywright` 是否无头由环境变量 **MERITCO_PLAYWRIGHT_HEADLESS** 决定（默认无头），不再读取本项。 */
  headless?: boolean;
  /** 与 Network 里 User-Agent 一致，减少与真实浏览器差异 */
  userAgent?: string;
}

export function loadHttpConfig(filePath: string): MeritcoHttpConfig {
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as unknown;
  if (typeof data !== "object" || data === null) {
    throw new Error("meritco.http.json 根节点必须是对象");
  }
  const o = data as Record<string, unknown>;
  if (typeof o.baseUrl !== "string" || !o.baseUrl) throw new Error("缺少 baseUrl");
  if (typeof o.createTask !== "object" || o.createTask === null) throw new Error("缺少 createTask");
  if (typeof o.extractBody !== "object" || o.extractBody === null) throw new Error("缺少 extractBody");

  const ct = o.createTask as Record<string, unknown>;
  const after = (ct.afterCreate as string | undefined) ?? "poll";
  if (after === "poll") {
    if (typeof o.poll !== "object" || o.poll === null) {
      throw new Error("afterCreate 为 poll（默认）时必须提供 poll 配置");
    }
    validatePollBlock(o.poll as Record<string, unknown>);
  }
  if (after === "extract" && ct.completedWhen) {
    validateCompletedWhen(ct.completedWhen as CompletedWhen, "createTask");
  }
  if (after === "extract" && ct.pollIfExtractEmpty === true) {
    if (typeof o.poll !== "object" || o.poll === null) {
      throw new Error("pollIfExtractEmpty 为 true 时必须提供 poll");
    }
    validatePollBlock(o.poll as Record<string, unknown>);
  }

  return data as MeritcoHttpConfig;
}

function validatePollBlock(p: Record<string, unknown>): void {
  if (p.sameAsCreate === true && p.untilBodyReady !== true) {
    throw new Error("poll.sameAsCreate 必须与 poll.untilBodyReady:true 同时使用");
  }
  if (p.untilBodyReady === true) {
    return;
  }
  if (!p.completedWhen || typeof p.completedWhen !== "object") {
    throw new Error(
      "poll 需设置 untilBodyReady:true（按正文是否可解析结束）或提供 poll.completedWhen（按状态字段结束）",
    );
  }
  validateCompletedWhen(p.completedWhen as CompletedWhen, "poll");
}

export function validateCompletedWhen(cw: CompletedWhen, label: string): void {
  const hasEq = cw.equals !== undefined;
  const hasIn = Array.isArray(cw.in) && cw.in.length > 0;
  if (hasEq && hasIn) {
    throw new Error(`${label}：completedWhen 请只填 equals 或 in 之一，不要同时填写`);
  }
  if (!hasEq && !hasIn) {
    throw new Error(`${label}：completedWhen 需填写 equals 或 in 之一`);
  }
}

/**
 * smartWords/get 常见首包：若干 { type, words:[{ name, value, ... }] }，
 * 仅为联想/分类候选，不是长文报告正文。
 */
export function isMeritcoAuxiliaryWordsResult(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).type === "string" &&
      Array.isArray((item as Record<string, unknown>).words),
  );
}

/** 单条联想词行：名称 + 数量（与页面「xxx - 611」一致） */
function formatAuxiliaryWordEntry(w: unknown): string {
  if (!w || typeof w !== "object" || Array.isArray(w)) return "";
  const o = w as Record<string, unknown>;
  const label =
    typeof o.name === "string" && o.name.trim()
      ? o.name.trim()
      : typeof o.value === "string"
        ? o.value.trim()
        : "";
  if (!label) return "";
  const n = o.numReal ?? o.num;
  if (n !== undefined && n !== null && String(n) !== "") {
    return `${label} - ${n}`;
  }
  return label;
}

/**
 * 将 smartWords 联想结构格式化为可读文本（对齐「辅助搜索」：分类提示 + 品牌/产品联想词列表）。
 */
export function formatMeritcoAuxiliaryWordsForDisplay(value: unknown): string {
  if (!isMeritcoAuxiliaryWordsResult(value)) return "";
  const lines: string[] = [];
  lines.push("【辅助搜索】根据 query 展示搜索联想词，用于更精准召回、消除歧义（与页面同源数据）。");
  lines.push("");

  for (const item of value as Record<string, unknown>[]) {
    const ty = String(item.type);
    const words = item.words as unknown[];

    if (ty === "guess") {
      const parts: string[] = [];
      for (const w of words) {
        const line = formatAuxiliaryWordEntry(w);
        if (line) parts.push(line);
      }
      lines.push(`你输入的可能是：${parts.join(" · ")}`);
      continue;
    }

    const sectionTitle =
      ty === "brand" ? "品牌联想词" : ty === "product" ? "产品联想词" : `${ty} 联想词`;
    lines.push(sectionTitle);
    for (const w of words) {
      const line = formatAuxiliaryWordEntry(w);
      if (line) lines.push(`  ${line}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** 将联想结构压成一行式摘要，仅用于紧凑日志 */
export function formatMeritcoAuxiliaryWordsResult(value: unknown): string {
  if (!isMeritcoAuxiliaryWordsResult(value)) return "";
  const lines: string[] = [];
  for (const item of value as Record<string, unknown>[]) {
    const ty = String(item.type);
    const words = item.words as unknown[];
    const names: string[] = [];
    for (const w of words) {
      const s = formatAuxiliaryWordEntry(w);
      if (s) names.push(s);
    }
    lines.push(`[${ty}] ${names.join("、")}`);
  }
  return lines.join("\n");
}

/**
 * 首包/轮询里「尚未出现可解析正文」：null、空串、[]、{}、或仅 smartWords 联想结构（若未开 auxiliaryAsResult）。
 */
export function isExtractTargetEmpty(
  value: unknown,
  extractBody?: { auxiliaryAsResult?: boolean; asJson?: boolean },
): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) {
    if (extractBody?.asJson) return false;
    if (value.length === 0) return true;
    if (isMeritcoAuxiliaryWordsResult(value) && !extractBody?.auxiliaryAsResult) return true;
    return false;
  }
  if (typeof value === "object") {
    if (extractBody?.asJson) return false;
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/** 判断响应是否已达到完成态（用于轮询或首包校验） */
export function matchCompleted(json: unknown, cw: CompletedWhen): boolean {
  const v = getByPath(json, cw.path);
  if (cw.in !== undefined && cw.in.length > 0) {
    const s = String(v);
    return cw.in.map(String).includes(s);
  }
  if (cw.equals !== undefined) {
    return String(v) === cw.equals;
  }
  return false;
}

export function loadPlaywrightConfig(filePath: string): MeritcoPlaywrightConfig {
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as MeritcoPlaywrightConfig;
  const useEnter = data.submitWithEnter === true;
  const hasSearch =
    (typeof data.searchInputSelector === "string" && data.searchInputSelector.trim() !== "") ||
    (Array.isArray(data.searchInputSelectors) &&
      data.searchInputSelectors.some((x) => typeof x === "string" && x.trim() !== ""));
  if (!data.startUrl || !hasSearch || !data.bodySelector) {
    throw new Error(
      "meritco.playwright.json 缺少必填：startUrl、bodySelector，以及 searchInputSelector 或 searchInputSelectors 至少其一",
    );
  }
  if (!useEnter && (!data.submitSelector || !String(data.submitSelector).trim())) {
    throw new Error(
      "meritco.playwright.json：请设置 submitSelector，或设 submitWithEnter:true 用回车提交",
    );
  }
  const firstExtra = Array.isArray(data.searchInputSelectors)
    ? data.searchInputSelectors.find((x) => typeof x === "string" && x.trim())?.trim()
    : undefined;
  const stripDomSelectors = Array.isArray(data.stripDomSelectors)
    ? data.stripDomSelectors
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .map((s) => s.trim())
    : [];
  return {
    ...data,
    searchInputSelector: data.searchInputSelector?.trim() || firstExtra || "",
    cookieDomain: data.cookieDomain ?? ".meritco-group.com",
    cookiePath: data.cookiePath ?? "/",
    navigationTimeoutMs: data.navigationTimeoutMs ?? 60_000,
    generationTimeoutMs: data.generationTimeoutMs ?? 300_000,
    waitUntil: data.waitUntil ?? "domcontentloaded",
    minStableTextLength: data.minStableTextLength ?? 250,
    stablePollMs: data.stablePollMs ?? 2000,
    stableConsecutiveNeeded: data.stableConsecutiveNeeded ?? 5,
    scrollBodyToBottomBeforeRead: data.scrollBodyToBottomBeforeRead !== false,
    waitUntilSearchInputShowsQuery: data.waitUntilSearchInputShowsQuery !== false,
    searchInputQueryMatchMinMs: data.searchInputQueryMatchMinMs ?? 4000,
    searchInputQueryPollMs: data.searchInputQueryPollMs ?? 800,
    searchInputQueryLooseMatch: data.searchInputQueryLooseMatch !== false,
    searchInputQueryFallbackToBodyStable: data.searchInputQueryFallbackToBodyStable !== false,
    waitForBodyStableAfterSearchInput: data.waitForBodyStableAfterSearchInput !== false,
    preferPlainAnswerSection: data.preferPlainAnswerSection !== false,
    stripDomSelectors,
    afterSubmitPauseMs: data.afterSubmitPauseMs ?? 1200,
    headless: data.headless !== false,
  };
}

/** 解析配置目录：优先 MERITCO_CONFIG_DIR，否则为当前工作目录 */
export function resolveConfigDir(): string {
  const dir = process.env.MERITCO_CONFIG_DIR?.trim();
  return dir ? resolve(dir) : process.cwd();
}

export function resolveHttpConfigPath(): string {
  const override = process.env.MERITCO_HTTP_CONFIG?.trim();
  const p = override ? resolve(override) : resolve(resolveConfigDir(), "meritco.http.json");
  if (!existsSync(p)) {
    throw new Error(
      `未找到 HTTP 配置文件：${p}。请复制 config/meritco.http.example.json 为 meritco.http.json 并按 docs/capture-guide.md 填写。`,
    );
  }
  return p;
}

export function resolvePlaywrightConfigPath(): string {
  const override = process.env.MERITCO_PLAYWRIGHT_CONFIG?.trim();
  const p = override ? resolve(override) : resolve(resolveConfigDir(), "meritco.playwright.json");
  if (!existsSync(p)) {
    throw new Error(
      `未找到 Playwright 配置文件：${p}。请复制 config/meritco.playwright.example.json 为 meritco.playwright.json。`,
    );
  }
  return p;
}

/** 用于探测配置文件是否存在（不抛错） */
export function httpConfigPathIfExists(): string | null {
  const override = process.env.MERITCO_HTTP_CONFIG?.trim();
  const p = override ? resolve(override) : resolve(resolveConfigDir(), "meritco.http.json");
  return existsSync(p) ? p : null;
}

export function playwrightConfigPathIfExists(): string | null {
  const override = process.env.MERITCO_PLAYWRIGHT_CONFIG?.trim();
  const p = override ? resolve(override) : resolve(resolveConfigDir(), "meritco.playwright.json");
  return existsSync(p) ? p : null;
}

/** 将接口返回值规范为「仅正文」字符串（严格模式） */
export function coerceBodyText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error("正文字段不是字符串，请在 meritco.http.json 的 extractBody.path 指向最终文本字段");
}

const FLEX_BODY_KEYS = [
  "content",
  "text",
  "markdown",
  "answer",
  "body",
  "msg",
  "message",
  "smartWords",
  "report",
  "html",
  "value",
  "desc",
  "description",
  "summary",
  "output",
  "precis",
  "article",
  "reply",
  "resultText",
  "gptResult",
  "wordContent",
];

/** 递归收集嵌套对象/数组里的文本，取最长的一段作为正文（久谦 result 常多层嵌套） */
function findLongestNestedString(value: unknown, depth: number, minLen: number): string {
  if (depth <= 0) return "";
  if (typeof value === "string") {
    const t = value.trim();
    return t.length >= minLen ? t : "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    const s = String(value);
    return s.length >= minLen ? s : "";
  }
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      const s = findLongestNestedString(item, depth - 1, minLen);
      if (s) parts.push(s);
    }
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    return [...new Set(parts)].join("\n\n");
  }
  const o = value as Record<string, unknown>;
  for (const k of FLEX_BODY_KEYS) {
    const v = o[k];
    if (typeof v === "string" && v.trim().length >= minLen) return v.trim();
  }
  let best = "";
  for (const [k, v] of Object.entries(o)) {
    if (
      /^(id|uuid|code|status|type|traceId|conversationId|createTime|updateTime)$/i.test(k) &&
      typeof v === "string" &&
      v.length < 80
    ) {
      continue;
    }
    const s = findLongestNestedString(v, depth - 1, minLen);
    if (s.length > best.length) best = s;
  }
  return best;
}

/**
 * 按 extractBody 配置取出正文；flexible 时在对象上尝试常见子字段，并递归深挖嵌套结构。
 */
export function extractMeritcoBody(
  responseJson: unknown,
  cfg: { path: string; flexible?: boolean; auxiliaryAsResult?: boolean; asJson?: boolean },
): string {
  const raw = getByPath(responseJson, cfg.path);
  if (raw === null || raw === undefined) {
    throw new Error(`正文字段路径无值：${cfg.path}`);
  }
  if (cfg.asJson && typeof raw === "object" && raw !== null) {
    return JSON.stringify(raw, null, 2);
  }
  if (Array.isArray(raw) && raw.length === 0) {
    throw new Error(
      `${cfg.path} 为空数组 []。若首包如此多为异步生成：请配置 createTask.pollIfExtractEmpty、responseTaskIdPath 与 poll.untilBodyReady。`,
    );
  }
  if (cfg.auxiliaryAsResult && Array.isArray(raw) && isMeritcoAuxiliaryWordsResult(raw)) {
    return formatMeritcoAuxiliaryWordsForDisplay(raw);
  }
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (cfg.flexible && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of FLEX_BODY_KEYS) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    for (const v of Object.values(o)) {
      if (typeof v === "string" && v.trim().length > 40) return v.trim();
    }
    const nested = findLongestNestedString(raw, 8, 12);
    if (nested.length > 0) return nested;
  }
  if (cfg.flexible && Array.isArray(raw)) {
    const nested = findLongestNestedString(raw, 8, 12);
    if (nested.length > 0) return nested;
  }
  if (Array.isArray(raw) && isMeritcoAuxiliaryWordsResult(raw)) {
    const hint = formatMeritcoAuxiliaryWordsResult(raw);
    throw new Error(
      `无法在 ${cfg.path} 得到报告正文：当前为 smartWords 联想结构（type/words），不是长文结论。` +
        (hint ? `\n摘要：\n${hint}` : "") +
        `\n完整回答通常在 bot 页渲染；请用通用查询 Playwright（meritco_universal_search）或对照页面网络面板调整 HTTP 契约。`,
    );
  }
  const debug =
    process.env.MERITCO_DEBUG_EXTRACT === "1"
      ? ` 调试片段: ${JSON.stringify(raw).slice(0, 600)}`
      : " 可设环境变量 MERITCO_DEBUG_EXTRACT=1 查看 result 片段，或把 extractBody.path 改成 DevTools 响应里的具体字段。";
  throw new Error(`无法在 ${cfg.path} 得到正文字符串。${debug}`);
}

/** 与久谦类接口常见的任务/会话 id 字段名（按顺序尝试，避免误用纯数字 code） */
const TASK_ID_FIELD_NAMES = [
  "traceId",
  "requestId",
  "conversationId",
  "sessionId",
  "taskId",
  "bizId",
  "jobId",
  "messageId",
  "chatId",
  "id",
];

function pickScalarId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof value === "number" && !Number.isNaN(value)) return String(value);
  return null;
}

/** 在单层对象上按常见字段名取 id */
function taskIdFromRecord(o: Record<string, unknown>): string | null {
  for (const name of TASK_ID_FIELD_NAMES) {
    const found = pickScalarId(o[name]);
    if (found) return found;
  }
  return null;
}

/**
 * 首包未配置路径或路径未命中时，在根节点及 data/result/payload 下探测任务 id。
 */
export function discoverTaskIdFromMeritcoResponse(json: unknown): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const root = json as Record<string, unknown>;
  const a = taskIdFromRecord(root);
  if (a) return a;
  for (const nest of ["data", "result", "payload", "body"]) {
    const sub = root[nest];
    if (sub && typeof sub === "object" && !Array.isArray(sub)) {
      const b = taskIdFromRecord(sub as Record<string, unknown>);
      if (b) return b;
    }
  }
  return null;
}

function normalizeTaskIdPaths(config: MeritcoHttpConfig): string[] {
  const p = config.createTask.responseTaskIdPath;
  if (p === undefined || p === null) return [];
  if (Array.isArray(p)) {
    return p.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  }
  if (typeof p === "string" && p.trim()) return [p.trim()];
  return [];
}

export function readTaskId(config: MeritcoHttpConfig, responseJson: unknown): string {
  const paths = normalizeTaskIdPaths(config);
  for (const path of paths) {
    const id = getByPath(responseJson, path);
    if (id !== undefined && id !== null && String(id).trim() !== "") {
      return String(id).trim();
    }
  }
  const discovered = discoverTaskIdFromMeritcoResponse(responseJson);
  if (discovered) return discovered;
  const tried = paths.length > 0 ? paths.join(" → ") : "（未配置路径）";
  const hint =
    process.env.MERITCO_DEBUG_EXTRACT === "1" && responseJson && typeof responseJson === "object"
      ? ` 首包键: ${Object.keys(responseJson as object).join(", ")}`
      : " 请设 MERITCO_DEBUG_EXTRACT=1 查看首包 JSON，并在 createTask.responseTaskIdPath 写上正确点号路径（可为字符串数组）。";
  throw new Error(`响应中未找到任务 id。已尝试路径：${tried}；自动探测常见字段也未命中。${hint}`);
}
