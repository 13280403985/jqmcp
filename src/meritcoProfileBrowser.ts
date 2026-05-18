/**
 * 有头打开久谦 bot，使用持久化 Chromium 用户目录：在此窗口登录一次后，
 * 配置 MERITCO_USE_PERSIST_PROFILE=1（或 MERITCO_CHROMIUM_USER_DATA 指向同一路径）即可让 MCP 无头复用会话，无需再抄 Cookie/Token。
 */
import { chromium } from "playwright";
import { loadMeritcoLocalEnv } from "./loadMeritcoLocalEnv.js";
import { loadPlaywrightConfig, resolvePlaywrightConfigPath } from "./httpConfig.js";
import {
  defaultChromiumUserDataDir,
  MERITCO_CHROMIUM_PROFILE_DIRNAME,
  profileDirExists,
} from "./meritcoChromiumProfile.js";

async function main(): Promise<void> {
  loadMeritcoLocalEnv();
  const cfgPath = resolvePlaywrightConfigPath();
  const cfg = loadPlaywrightConfig(cfgPath);
  const userDataDir = defaultChromiumUserDataDir();

  console.error(`[jqmcp-profile] 用户数据目录: ${userDataDir}`);
  console.error(
    `[jqmcp-profile] 若首次使用，登录成功后请在 meritco.local.env 增加一行：MERITCO_USE_PERSIST_PROFILE=1（或 MERITCO_CHROMIUM_USER_DATA=${userDataDir.replace(/\\/g, "\\\\")}）`,
  );
  if (profileDirExists(userDataDir)) {
    console.error(`[jqmcp-profile] 检测到已有 ${MERITCO_CHROMIUM_PROFILE_DIRNAME}，将复用其中会话。`);
  } else {
    console.error("[jqmcp-profile] 首次运行：请在弹出窗口中完成久谦登录并进入 bot 页。");
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ...(cfg.userAgent?.trim() ? { userAgent: cfg.userAgent.trim() } : {}),
  });

  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(cfg.navigationTimeoutMs);

  let origin: string;
  try {
    origin = new URL(cfg.startUrl).origin;
  } catch {
    origin = "https://research.meritco-group.com";
  }
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: cfg.navigationTimeoutMs });
  await page.goto(cfg.startUrl, { waitUntil: cfg.waitUntil ?? "domcontentloaded" });

  console.error("[jqmcp-profile] 浏览器已打开。登录并确认能正常使用通用查询后，**在本终端按回车**关闭浏览器并退出。");
  await new Promise<void>((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  await context.close();
  console.error("[jqmcp-profile] 已关闭。请重载 MCP 后使用 meritco_universal_search。");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
