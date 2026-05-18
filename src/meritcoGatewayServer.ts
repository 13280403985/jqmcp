/**
 * 办公室内网 HTTP 网关：同事设备用 API Key 调用通用查询，凭证只在本机/服务器。
 * 请求默认串行执行，减轻久谦侧 514/抢会话。
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMeritcoLocalEnv } from "./loadMeritcoLocalEnv.js";
import { runMeritcoUniversalPreferred, type MeritcoUniversalOpts } from "./universalMeritco.js";

/** 全局串行队列：同一时刻只跑一条通用查询 */
let queueTail: Promise<unknown> = Promise.resolve();

function enqueueExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = queueTail.then(() => task());
  queueTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on("data", (c: Buffer) => {
      n += c.length;
      if (n > maxBytes) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(s),
  });
  res.end(s);
}

function clientIp(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0]!.trim();
  const a = req.socket.remoteAddress;
  return a ? a.replace(/^::ffff:/, "") : "";
}

function allowIp(ip: string): boolean {
  const raw = process.env.MERITCO_GATEWAY_ALLOW_IPS?.trim();
  if (!raw) return true;
  const set = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return set.has(ip);
}

function extractApiKey(req: IncomingMessage): string | null {
  const expected = process.env.MERITCO_GATEWAY_API_KEY?.trim();
  if (!expected) return null;
  const bearer = req.headers.authorization?.trim();
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const t = bearer.slice(7).trim();
    if (t === expected) return t;
  }
  const headerKey =
    (req.headers["x-meritco-gateway-key"] as string | undefined)?.trim() ||
    (req.headers["x-api-key"] as string | undefined)?.trim();
  if (headerKey === expected) return headerKey;
  return null;
}

function corsHeaders(): Record<string, string> {
  const origin = process.env.MERITCO_GATEWAY_CORS_ORIGIN?.trim();
  if (origin === "" || origin === "0") return {};
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Meritco-Gateway-Key, X-Api-Key",
    "Access-Control-Max-Age": "86400",
  };
}

async function handleUniversalSearch(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ip = clientIp(req);
  if (!allowIp(ip)) {
    json(res, 403, { ok: false, error: "客户端 IP 不在 MERITCO_GATEWAY_ALLOW_IPS 白名单内" });
    return;
  }
  if (extractApiKey(req) === null) {
    json(res, 401, {
      ok: false,
      error: "未授权：请携带 Authorization: Bearer <MERITCO_GATEWAY_API_KEY> 或 X-Meritco-Gateway-Key",
    });
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req, 256_000);
  } catch {
    json(res, 400, { ok: false, error: "读取请求体失败" });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    json(res, 400, { ok: false, error: "JSON 无效" });
    return;
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    json(res, 400, { ok: false, error: "缺少非空字段 query" });
    return;
  }

  const opts: MeritcoUniversalOpts = {};
  if (typeof body.timeoutMs === "number" && Number.isFinite(body.timeoutMs)) opts.timeoutMs = body.timeoutMs;
  if (body.conversationId !== undefined && body.conversationId !== null) {
    opts.conversationId = body.conversationId as string | number;
  }
  if (typeof body.category === "string") opts.category = body.category;
  if (typeof body.page === "number") opts.page = body.page;
  if (typeof body.pageSize === "number") opts.pageSize = body.pageSize;

  try {
    const text = await enqueueExclusive(() => runMeritcoUniversalPreferred(query, opts));
    json(res, 200, { ok: true, text });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    json(res, 502, { ok: false, error: message });
  }
}

export async function startMeritcoGateway(): Promise<void> {
  loadMeritcoLocalEnv();
  const apiKey = process.env.MERITCO_GATEWAY_API_KEY?.trim();
  if (!apiKey || apiKey.length < 8) {
    console.error(
      "[jqmcp-gateway] 请设置 MERITCO_GATEWAY_API_KEY（建议 ≥16 位随机串）。勿提交到 Git。",
    );
    process.exit(1);
  }

  const port = Number(process.env.MERITCO_GATEWAY_PORT?.trim() || "8787");
  const host = process.env.MERITCO_GATEWAY_HOST?.trim() || "0.0.0.0";
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error("[jqmcp-gateway] MERITCO_GATEWAY_PORT 无效");
    process.exit(1);
  }

  const cors = corsHeaders();
  const server = createServer(async (req, res) => {
    const h = { ...cors };
    for (const [k, v] of Object.entries(h)) res.setHeader(k, v);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url?.split("?")[0] || "/";

    if (req.method === "GET" && (url === "/health" || url === "/")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, service: "jqmcp-gateway", queue: "serial" }));
      return;
    }

    if (
      req.method === "POST" &&
      (url === "/v1/universal-search" || url === "/v1/search")
    ) {
      await handleUniversalSearch(req, res);
      return;
    }

    json(res, 404, { ok: false, error: "未找到路由。POST /v1/universal-search，body: { query, ... }" });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on("error", reject);
  });

  console.error(
    `[jqmcp-gateway] 监听 http://${host}:${port} ；通用查询 POST /v1/universal-search ；健康检查 GET /health`,
  );
  if (process.env.MERITCO_GATEWAY_ALLOW_IPS?.trim()) {
    console.error(`[jqmcp-gateway] IP 白名单已启用：${process.env.MERITCO_GATEWAY_ALLOW_IPS}`);
  } else {
    console.error("[jqmcp-gateway] 未设置 MERITCO_GATEWAY_ALLOW_IPS：任意来源可连（仍须 API Key）。办公室建议配网段内 IP。");
  }
}

async function main(): Promise<void> {
  await startMeritcoGateway();
}

const isMain =
  path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((e) => {
    console.error("[jqmcp-gateway] 致命错误:", e);
    process.exit(1);
  });
}
