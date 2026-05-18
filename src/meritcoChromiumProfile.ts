import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveConfigDir } from "./httpConfig.js";

/** 持久化目录默认名（与 Cookie 文件区分，勿提交仓库） */
export const MERITCO_CHROMIUM_PROFILE_DIRNAME = "meritco-chromium-profile";

/**
 * 是否使用「内置 Chromium 用户目录」代替每次无痕上下文 + Cookie/Token。
 * - 设 `MERITCO_USE_PERSIST_PROFILE=1`：目录为 `{MERITCO_CONFIG_DIR}/meritco-chromium-profile`（或 cwd）。
 * - 或设 `MERITCO_CHROMIUM_USER_DATA=绝对/相对路径` 自定义目录（此时不必再设 USE_PERSIST）。
 * - 设 `MERITCO_USE_PERSIST_PROFILE=0`：显式关闭，即使曾用过持久目录。
 */
export function resolveChromiumUserDataDirForPlaywright(): string | null {
  const off = process.env.MERITCO_USE_PERSIST_PROFILE?.trim().toLowerCase();
  if (off === "0" || off === "false" || off === "off") return null;

  const custom = process.env.MERITCO_CHROMIUM_USER_DATA?.trim();
  if (custom) return resolve(custom);

  const on = process.env.MERITCO_USE_PERSIST_PROFILE?.trim().toLowerCase();
  if (on === "1" || on === "true" || on === "on") {
    return join(resolveConfigDir(), MERITCO_CHROMIUM_PROFILE_DIRNAME);
  }

  return null;
}

/** 供「仅打开登录窗口」脚本使用：始终指向可写目录（与启用持久化时的默认一致） */
export function defaultChromiumUserDataDir(): string {
  const custom = process.env.MERITCO_CHROMIUM_USER_DATA?.trim();
  if (custom) return resolve(custom);
  return join(resolveConfigDir(), MERITCO_CHROMIUM_PROFILE_DIRNAME);
}

/** 脚本启动前提示：目录已存在说明曾登录过 */
export function profileDirExists(dir: string): boolean {
  try {
    return existsSync(dir);
  } catch {
    return false;
  }
}
