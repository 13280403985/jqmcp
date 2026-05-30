/**
 * Mini smoke test —— 用 5 个关键 case 快速验证 jqmcp 没被改坏。
 *
 * 覆盖的 5 条代码路径（最容易因改动出问题的）：
 *   1. meritco_universal_search       —— 独立模块 universalMeritco.ts（不复用 page-analysis）
 *   2. meritco_brand_identity 阶段一  —— parseCandidates 候选解析
 *   3. meritco_brand_identity 阶段二  —— REPORT_HEADER_PATTERN + 点击账号
 *   4. meritco_marketing_assessment   —— 双输入框 resolveTwoInputs
 *   5. meritco_media_volume (AND)     —— 双空格语义保留 + 通用 page-analysis
 *
 * 用法：
 *   npm run smoke:mini
 *
 * 退出码：5 个全过 0；任意失败 1。
 * 日志保存到 .jqmcp/smoke-mini-<时间戳>.log（包含每个 case 的完整 stdout/stderr）。
 *
 * 注意：
 *   - 串行执行（profile 互斥），全程约 5-7 分钟
 *   - 跑之前请确保没有别的 chromium 占着 meritco-chromium-profile
 *   - 久谦登录态有效，否则会出现「被跳转到登录页」
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LOG_DIR = join(ROOT, ".jqmcp");

/* -------------------------------------------------------------------------- */
/* 测试 case 表                                                                 */
/* -------------------------------------------------------------------------- */
/** @type {{name:string, cli:string, args:string[], checks:({kind:'minLen',value:number}|{kind:'contains',value:string}|{kind:'notContains',value:string})[], timeoutSec:number}[]} */
const CASES = [
  {
    name: "meritco_universal_search",
    cli: "scripts/run-universal.mjs",
    args: ["什么是茶饮赛道的护城河"],
    checks: [{ kind: "minLen", value: 600 }],
    timeoutSec: 240,
  },
  {
    name: "meritco_brand_identity 阶段一 (拿候选)",
    cli: "scripts/run-identity.mjs",
    args: ["蜜雪冰城"],
    checks: [
      { kind: "minLen", value: 200 },
      { kind: "contains", value: "accountId" },
      { kind: "contains", value: "1997MXBC" },
    ],
    timeoutSec: 60,
  },
  {
    name: "meritco_brand_identity 阶段二 (拉报告)",
    cli: "scripts/run-identity.mjs",
    args: ["蜜雪冰城", "1997MXBC"],
    checks: [
      { kind: "minLen", value: 1500 },
      { kind: "contains", value: "关于" },
      { kind: "contains", value: "蜜雪冰城" },
    ],
    timeoutSec: 300,
  },
  {
    name: "meritco_marketing_assessment (双输入框)",
    cli: "scripts/run-assessment.mjs",
    args: ["蜜雪冰城", "520情侣证"],
    checks: [
      { kind: "minLen", value: 1500 },
      { kind: "contains", value: "营销有效性" },
    ],
    timeoutSec: 300,
  },
  {
    name: "meritco_media_volume (AND 语法 双空格)",
    cli: "scripts/run-media-volume.mjs",
    args: ["蜜雪冰城  雪王"],
    checks: [
      { kind: "minLen", value: 500 },
      { kind: "contains", value: "蜜雪冰城" },
      { kind: "contains", value: "雪王" },
    ],
    timeoutSec: 300,
  },
];

/* -------------------------------------------------------------------------- */
/* 工具                                                                        */
/* -------------------------------------------------------------------------- */

const SEP = "─".repeat(72);
const tsForFile = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};
const fmtSec = (ms) => `${(ms / 1000).toFixed(1)}s`;

/** 在 Windows 下用 cmd /c 包装 npm，其它平台直接 node。这里我们直接 node + cli 路径，更稳。 */
function runOne(caseDef) {
  return new Promise((resolveP) => {
    const t0 = Date.now();
    const child = spawn(
      process.execPath,
      [join(ROOT, caseDef.cli), ...caseDef.args],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          // 跑测试时不弹窗（避免环境变量残留导致 headed）
          MERITCO_PLAYWRIGHT_HEADLESS: process.env.MERITCO_PLAYWRIGHT_HEADLESS ?? "1",
          MERITCO_DEBUG_DEDUP: process.env.MERITCO_DEBUG_DEDUP ?? "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, caseDef.timeoutSec * 1000);

    child.on("close", (code) => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - t0;
      resolveP({ exitCode: code, stdout, stderr, elapsedMs });
    });
  });
}

function evalChecks(stdout, checks) {
  const failed = [];
  const passed = [];
  for (const c of checks) {
    if (c.kind === "minLen") {
      const ok = stdout.length >= c.value;
      (ok ? passed : failed).push(`长度 ≥ ${c.value}（实际 ${stdout.length}）`);
    } else if (c.kind === "contains") {
      const ok = stdout.includes(c.value);
      (ok ? passed : failed).push(`包含 ${JSON.stringify(c.value)}`);
    } else if (c.kind === "notContains") {
      const ok = !stdout.includes(c.value);
      (ok ? passed : failed).push(`不包含 ${JSON.stringify(c.value)}`);
    }
  }
  return { passed, failed };
}

/* -------------------------------------------------------------------------- */
/* 主流程                                                                      */
/* -------------------------------------------------------------------------- */

async function main() {
  // 可选过滤：JQMCP_SMOKE_ONLY="<子串>" 只跑名字含该子串的 case
  const filter = (process.env.JQMCP_SMOKE_ONLY ?? "").trim();
  const activeCases = filter
    ? CASES.filter((c) => c.name.includes(filter))
    : CASES;

  if (filter && activeCases.length === 0) {
    console.error(`[jqmcp smoke-mini] JQMCP_SMOKE_ONLY=${JSON.stringify(filter)} 没匹配到任何 case。可选名字：`);
    for (const c of CASES) console.error(`  - ${c.name}`);
    process.exit(2);
  }

  const headerNote = filter
    ? `仅跑匹配 "${filter}" 的 ${activeCases.length}/${CASES.length} 个用例`
    : `运行全部 ${CASES.length} 个用例，预计 5-7 分钟`;
  console.log(`\n${SEP}\n[jqmcp smoke-mini] ${headerNote}\n${SEP}\n`);

  await mkdir(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, `smoke-mini-${tsForFile()}.log`);
  const logChunks = [`[jqmcp smoke-mini] started at ${new Date().toISOString()}\n`];
  if (filter) logChunks.push(`filter: JQMCP_SMOKE_ONLY=${JSON.stringify(filter)}\n`);

  const results = [];
  const overallStart = Date.now();

  for (let i = 0; i < activeCases.length; i++) {
    const c = activeCases[i];
    const tag = `[${i + 1}/${activeCases.length}] ${c.name}`;
    console.log(`${tag}`);
    console.log(`    cli=${c.cli} args=${JSON.stringify(c.args)} timeout=${c.timeoutSec}s`);
    process.stdout.write(`    running… `);

    const t = await runOne(c);

    let status;
    let detail;
    if (t.exitCode !== 0) {
      status = "FAIL";
      // 抽 stderr 第一行做摘要
      const errLine = (t.stderr || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s && !s.startsWith(">") && !s.startsWith("npm "));
      detail = `exit_code=${t.exitCode} ${errLine ?? ""}`.trim();
    } else {
      const { passed, failed } = evalChecks(t.stdout, c.checks);
      if (failed.length === 0) {
        status = "PASS";
        detail = `${t.stdout.length} 字; ${passed.join(", ")}`;
      } else {
        status = "FAIL_CHECK";
        detail = `检查失败: ${failed.join("; ")}`;
      }
    }

    const mark = status === "PASS" ? "✅" : "❌";
    console.log(`${mark} ${status}  ${fmtSec(t.elapsedMs)}`);
    console.log(`    ${detail}\n`);

    results.push({ name: c.name, status, detail, elapsedMs: t.elapsedMs });

    // 完整 stdout/stderr 写日志
    logChunks.push(`\n${SEP}\n[${i + 1}/${activeCases.length}] ${c.name}\n${SEP}\n`);
    logChunks.push(`cli: ${c.cli}\nargs: ${JSON.stringify(c.args)}\nelapsed: ${fmtSec(t.elapsedMs)}\nstatus: ${status}\ndetail: ${detail}\nexit_code: ${t.exitCode}\n`);
    logChunks.push(`\n--- stdout ---\n${t.stdout}\n`);
    logChunks.push(`\n--- stderr ---\n${t.stderr}\n`);
  }

  const overallMs = Date.now() - overallStart;
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.length - passCount;

  console.log(SEP);
  console.log(`[jqmcp smoke-mini] 完成`);
  console.log(`  ✅ 通过: ${passCount}/${results.length}`);
  if (failCount > 0) {
    console.log(`  ❌ 失败: ${failCount}/${results.length}`);
    for (const r of results.filter((r) => r.status !== "PASS")) {
      console.log(`    - ${r.name}: ${r.detail}`);
    }
  }
  console.log(`  ⏱  总耗时: ${(overallMs / 1000 / 60).toFixed(1)} 分钟`);
  console.log(`  📄 完整日志: ${logPath}`);
  console.log(SEP);

  logChunks.push(`\n${SEP}\nFinal: ${passCount} pass / ${failCount} fail; ${(overallMs / 1000).toFixed(1)}s total\n`);
  await writeFile(logPath, logChunks.join(""), "utf8");

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`[jqmcp smoke-mini] 致命错误:`, e);
  process.exit(2);
});
