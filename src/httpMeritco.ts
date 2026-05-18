import { randomUUID } from "node:crypto";
import { getByPath, deepReplacePlaceholders } from "./jsonPath.js";
import {
  extractMeritcoBody,
  formatMeritcoAuxiliaryWordsForDisplay,
  isExtractTargetEmpty,
  isMeritcoAuxiliaryWordsResult,
  loadHttpConfig,
  matchCompleted,
  readTaskId,
  resolveHttpConfigPath,
  type MeritcoHttpConfig,
} from "./httpConfig.js";
import { requireMeritcoCookie } from "./env.js";

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** HTTP 工具可选参数（分页、会话维度 history/get 等） */
export type MeritcoHttpSearchOpts = {
  page?: number;
  pageSize?: number;
  conversationId?: string | number;
  category?: string;
};

/** 解析 {{conversationId}}：优先 MCP 参数 → MERITCO_CONVERSATION_ID → 纯数字 query（便于 CLI） */
function resolveConversationIdPlaceholder(query: string, opts?: MeritcoHttpSearchOpts): string {
  const fromOpt = opts?.conversationId;
  if (fromOpt !== undefined && String(fromOpt).trim() !== "") {
    return String(fromOpt).trim();
  }
  const env = process.env.MERITCO_CONVERSATION_ID?.trim();
  if (env) return env;
  if (/^\d+$/.test(query.trim())) return query.trim();
  return "";
}

/** 解析 {{category}}：优先 MCP 参数 → MERITCO_CATEGORY → 默认 DEEP_RESEARCH_SM（与抓包一致） */
function resolveCategoryPlaceholder(opts?: MeritcoHttpSearchOpts): string {
  const c = opts?.category?.trim() || process.env.MERITCO_CATEGORY?.trim();
  return c && c.length > 0 ? c : "DEEP_RESEARCH_SM";
}

/** 与 create / sameAsCreate 共用：query、分页、会话、{{traceId}} 等 */
function basePlaceholders(query: string, opts?: MeritcoHttpSearchOpts): Record<string, string> {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 10;
  return {
    query,
    traceId: randomUUID(),
    page: String(page),
    pageSize: String(pageSize),
    conversationId: resolveConversationIdPlaceholder(query, opts),
    category: resolveCategoryPlaceholder(opts),
  };
}

/** 占位符替换后，将指定键转为 JSON 数字（避免 conversationId 变成字符串） */
function coerceBodyNumericFields(body: unknown, fields: string[] | undefined): unknown {
  if (!fields?.length || body === null || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }
  const o = { ...(body as Record<string, unknown>) };
  for (const key of fields) {
    if (!(key in o)) continue;
    const v = o[key];
    if (typeof v === "string" && v.trim() !== "" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      const n = Number(v.trim());
      if (!Number.isNaN(n)) o[key] = n;
    }
  }
  return o;
}

function prepareCreateBody(config: MeritcoHttpConfig, basePh: Record<string, string>): unknown {
  if (!config.createTask.body) return undefined;
  const replaced = deepReplacePlaceholders(config.createTask.body, basePh);
  return coerceBodyNumericFields(replaced, config.createTask.bodyNumericFields);
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

function buildHeaders(config: MeritcoHttpConfig): Headers {
  const h = new Headers();
  const cookie = requireMeritcoCookie();
  for (const [k, v] of Object.entries(config.defaultHeaders ?? {})) {
    if (v !== undefined) h.set(k, v);
  }
  const token = process.env.MERITCO_TOKEN?.trim();
  if (token) {
    h.set("Token", token);
  }
  h.set("Cookie", cookie);
  return h;
}

/** 轮询时默认无输出；设 MERITCO_VERBOSE=1 可在 stderr 看到进度（MCP 仍勿用 stdout 打日志） */
function meritcoVerbose(): boolean {
  const v = process.env.MERITCO_VERBOSE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function logPollProgress(label: string, attemptIndex: number, maxAttempts: number): void {
  if (!meritcoVerbose()) return;
  const n = attemptIndex + 1;
  if (n === 1 || n % 5 === 0 || n === maxAttempts) {
    console.error(`[jqmcp] ${label}：第 ${n}/${maxAttempts} 次请求，尚未解析到正文，继续…`);
  }
}

function describeHttpError(status: number, json: unknown, text: string): string {
  if (status === 401 || status === 403) {
    return `HTTP ${status}：凭证可能已失效，请更新 MERITCO_COOKIE / MERITCO_TOKEN。`;
  }
  if (status === 429) {
    return `HTTP 429：触发限流，请稍后重试。`;
  }
  if (json && typeof json === "object") {
    const msg = (json as Record<string, unknown>).message ?? (json as Record<string, unknown>).msg;
    if (typeof msg === "string" && msg) return `HTTP ${status}：${msg}`;
  }
  const snippet = text.slice(0, 200).replace(/\s+/g, " ");
  return `HTTP ${status}：${snippet || "无响应体"}`;
}

/** 轮询阶段：支持 untilBodyReady（直到能解析出非空正文）或 completedWhen */
async function runPollPhase(
  config: MeritcoHttpConfig,
  headers: Headers,
  basePh: Record<string, string>,
  taskId: string,
  timeoutMs: number | undefined,
): Promise<string> {
  const poll = config.poll;
  if (!poll) {
    throw new Error("内部错误：runPollPhase 调用时缺少 poll");
  }
  const ph = { ...basePh, taskId };
  const pollMethod = poll.method ?? "GET";
  const pollPath = deepReplacePlaceholders(poll.pathTemplate, ph) as string;
  const pollUrl = joinUrl(config.baseUrl, pollPath);

  const maxConfiguredMs = poll.maxAttempts * poll.intervalMs;
  const capMs = timeoutMs !== undefined ? Math.min(timeoutMs, maxConfiguredMs) : maxConfiguredMs;
  const maxAttempts = Math.max(1, Math.floor(capMs / poll.intervalMs));

  let lastJson: unknown = null;

  if (poll.untilBodyReady) {
    for (let i = 0; i < maxAttempts; i++) {
      logPollProgress("轮询(untilBodyReady)", i, maxAttempts);
      if (i > 0) {
        await new Promise((r) => setTimeout(r, poll.intervalMs));
      }
      const pollBody = poll.body ? deepReplacePlaceholders(poll.body, ph) : undefined;
      const pollInit: RequestInit = {
        method: pollMethod,
        headers,
        body:
          pollBody !== undefined && pollMethod !== "GET" ? JSON.stringify(pollBody) : undefined,
      };
      const polled = await fetchJson(pollUrl, pollInit);
      if (!polled.ok) {
        throw new Error(describeHttpError(polled.status, polled.json, polled.text));
      }
      lastJson = polled.json;
      try {
        const textOut = extractMeritcoBody(polled.json, config.extractBody);
        if (textOut.trim().length > 0) {
          return textOut.trim();
        }
      } catch {
        // 仍为 [] 或结构不对，继续轮询
      }
    }
    throw new Error(
      `轮询 ${maxAttempts} 次后仍无法从 extractBody 解析出非空正文。末次响应片段：${JSON.stringify(lastJson).slice(0, 500)}。请核对 responseTaskIdPath、poll 请求体与 extractBody.path，或在 DevTools 对照真实接口。`,
    );
  }

  const cw = poll.completedWhen;
  if (!cw) {
    throw new Error("poll 缺少 completedWhen（若要用正文就绪结束请设 untilBodyReady:true）");
  }

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, poll.intervalMs));
    }
    const pollBody = poll.body ? deepReplacePlaceholders(poll.body, ph) : undefined;
    const pollInit: RequestInit = {
      method: pollMethod,
      headers,
      body:
        pollBody !== undefined && pollMethod !== "GET" ? JSON.stringify(pollBody) : undefined,
    };
    const polled = await fetchJson(pollUrl, pollInit);
    if (!polled.ok) {
      throw new Error(describeHttpError(polled.status, polled.json, polled.text));
    }
    lastJson = polled.json;
    if (matchCompleted(polled.json, cw)) {
      return extractMeritcoBody(polled.json, config.extractBody);
    }
  }

  const hint =
    cw.in && cw.in.length
      ? `${cw.path} in [${cw.in.join(",")}]`
      : `${cw.path} === "${cw.equals}"`;
  throw new Error(
    `在 ${maxAttempts} 次轮询内未达到完成状态（期望 ${hint}）。最后一次响应片段：${JSON.stringify(lastJson).slice(0, 400)}`,
  );
}

/**
 * 首包无任务 id 时：反复发送与 createTask 相同的请求，直到 extractBody 能取出非空正文（依赖服务端 Session）。
 */
async function runPollSameAsCreate(
  config: MeritcoHttpConfig,
  headers: Headers,
  basePh: Record<string, string>,
  timeoutMs: number | undefined,
): Promise<string> {
  const poll = config.poll;
  if (!poll) {
    throw new Error("内部错误：runPollSameAsCreate 缺少 poll");
  }
  const createPath = deepReplacePlaceholders(config.createTask.path, basePh) as string;
  const createUrl = joinUrl(config.baseUrl, createPath);
  const body = prepareCreateBody(config, basePh);
  const method = config.createTask.method;

  const maxConfiguredMs = poll.maxAttempts * poll.intervalMs;
  const capMs = timeoutMs !== undefined ? Math.min(timeoutMs, maxConfiguredMs) : maxConfiguredMs;
  const maxAttempts = Math.max(1, Math.floor(capMs / poll.intervalMs));

  let lastJson: unknown = null;
  for (let i = 0; i < maxAttempts; i++) {
    logPollProgress("sameAsCreate 轮询", i, maxAttempts);
    if (i > 0) {
      await new Promise((r) => setTimeout(r, poll.intervalMs));
    }
    const createInit: RequestInit = {
      method,
      headers,
      body:
        body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
    };
    const res = await fetchJson(createUrl, createInit);
    if (!res.ok) {
      throw new Error(describeHttpError(res.status, res.json, res.text));
    }
    lastJson = res.json;
    try {
      const textOut = extractMeritcoBody(res.json, config.extractBody);
      if (textOut.trim().length > 0) {
        return textOut.trim();
      }
    } catch {
      // result 仍为 [] 等，继续轮询
    }
  }
  const lastSlice = JSON.stringify(lastJson).slice(0, 500);
  let extra = "";
  try {
    const lastResult = getByPath(lastJson, config.extractBody.path);
    if (isMeritcoAuxiliaryWordsResult(lastResult)) {
      const fmt = formatMeritcoAuxiliaryWordsForDisplay(lastResult);
      extra = `\n末次仍为联想词结构（非报告正文）。${fmt ? `摘要：\n${fmt}\n` : ""}`;
    }
  } catch {
    // ignore
  }
  throw new Error(
    `sameAsCreate 已轮询 ${maxAttempts} 次仍无正文。末次: ${lastSlice}。${extra}页面长文多在 bot 侧渲染；smartWords/get 通常只返回联想分类。通用查询请改用 Playwright（npm run query:pw / meritco_universal_search）；或对照 DevTools 找能返回正文的 HTTP（若有）。`,
  );
}

/**
 * 按 meritco.http.json 契约执行：创建任务 →（可选）轮询完成 → 仅返回正文字符串。
 */
export async function runUniversalSearchHttp(
  query: string,
  timeoutMs?: number,
  opts?: MeritcoHttpSearchOpts,
): Promise<string> {
  const path = resolveHttpConfigPath();
  const config = loadHttpConfig(path);
  const headers = buildHeaders(config);
  const afterCreate = config.createTask.afterCreate ?? "poll";
  const basePh = basePlaceholders(query, opts);

  const createPath = deepReplacePlaceholders(config.createTask.path, basePh) as string;
  const createUrl = joinUrl(config.baseUrl, createPath);
  const body = prepareCreateBody(config, basePh);

  const createInit: RequestInit = {
    method: config.createTask.method,
    headers,
    body:
      body !== undefined && config.createTask.method !== "GET"
        ? JSON.stringify(body)
        : undefined,
  };

  const created = await fetchJson(createUrl, createInit);
  if (!created.ok) {
    throw new Error(describeHttpError(created.status, created.json, created.text));
  }

  if (afterCreate === "extract") {
    const cw = config.createTask.completedWhen;
    if (cw && !matchCompleted(created.json, cw)) {
      const cur = getByPath(created.json, cw.path);
      throw new Error(
        `首包尚未完成：字段 ${cw.path} 当前值为 ${JSON.stringify(cur)}，与配置的完成条件不一致`,
      );
    }

    const target = getByPath(created.json, config.extractBody.path);
    if (!isExtractTargetEmpty(target, config.extractBody)) {
      return extractMeritcoBody(created.json, config.extractBody);
    }

    /**
     * history/get 等常仅 { code, message }，无 result：整包 JSON 易被 Agent 误当成「回答正文」。
     * 前置说明并指向 Playwright / 改契约，减少编排误判。
     */
    if (
      config.extractBody.asJson &&
      (cw === undefined || matchCompleted(created.json, cw))
    ) {
      const rawJson = JSON.stringify(created.json, null, 2);
      const hint =
        `[jqmcp] 当前 HTTP 响应里 extractBody.path「${config.extractBody.path}」为空或不存在；下列内容只是接口 JSON（例如 history/get 的成功包），**不是**通用查询生成的报告正文。\n\n` +
        "要对**新问题**做全文检索：请使用 **Playwright**（`meritco_universal_search` 或 npm run query:pw / query:uni）；或把 meritco.http.json 改成真正「提交问题」的接口。\n\n" +
        `--- 原始响应 ---\n`;
      return hint + rawJson;
    }

    if (config.createTask.pollIfExtractEmpty && config.poll) {
      if (config.poll.sameAsCreate) {
        return runPollSameAsCreate(config, headers, basePh, timeoutMs);
      }
      const taskId = readTaskId(config, created.json);
      return runPollPhase(config, headers, basePh, taskId, timeoutMs);
    }

    const dbg =
      process.env.MERITCO_DEBUG_EXTRACT === "1"
        ? ` 首包片段: ${JSON.stringify(created.json).slice(0, 800)}`
        : " 可设 MERITCO_DEBUG_EXTRACT=1 查看首包 JSON；若含 traceId/requestId 等，请配置 responseTaskIdPath 并设 pollIfExtractEmpty + poll.untilBodyReady。";
    const auxHint =
      isMeritcoAuxiliaryWordsResult(target) &&
      !config.createTask.pollIfExtractEmpty &&
      !config.extractBody.auxiliaryAsResult
        ? " 首包为 smartWords 联想结构：可在 extractBody 设 auxiliaryAsResult:true 直接返回联想文本；或打开 pollIfExtractEmpty 轮询长文；或 Playwright。"
        : "";
    throw new Error(
      `首包 ${config.extractBody.path} 为空（如 []），无法直接取正文。${auxHint}${dbg}`,
    );
  }

  const poll = config.poll;
  if (!poll) {
    throw new Error("缺少 poll 配置：若需轮询请勿省略，或设置 createTask.afterCreate 为 extract");
  }

  if (poll.sameAsCreate) {
    return runPollSameAsCreate(config, headers, basePh, timeoutMs);
  }

  const taskId = readTaskId(config, created.json);
  return runPollPhase(config, headers, basePh, taskId, timeoutMs);
}
