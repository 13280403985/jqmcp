"""
调用上级目录 Node 通用查询（Playwright），供 FastMCP 工具使用。
"""
from __future__ import annotations

import os
import subprocess
import threading
from pathlib import Path

# 仓库根目录（mcp-server 的上一级）
REPO_ROOT = Path(__file__).resolve().parent.parent
RUN_SCRIPT = REPO_ROOT / "scripts" / "run-universal.mjs"
DIST_MARKER = REPO_ROOT / "dist" / "universalMeritco.js"

# 同一 profile 不宜并发跑多条 Playwright 查询
_query_lock = threading.Lock()


def _ensure_built() -> None:
    if not DIST_MARKER.is_file():
        raise RuntimeError(
            f"未找到 {DIST_MARKER}。请先在仓库根目录执行：npm install && npm run build"
        )
    if not RUN_SCRIPT.is_file():
        raise RuntimeError(f"未找到 {RUN_SCRIPT}")


def run_meritco_universal_search(query: str) -> str:
    """在久谦 bot 页执行通用查询，返回页面正文（stdout）。"""
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")

    _ensure_built()

    env = os.environ.copy()
    env.setdefault("MERITCO_CONFIG_DIR", str(REPO_ROOT))

    timeout_sec = int(os.environ.get("MERITCO_QUERY_TIMEOUT_SEC", "900"))

    with _query_lock:
        proc = subprocess.run(
            ["node", str(RUN_SCRIPT), q],
            cwd=str(REPO_ROOT),
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_sec,
        )

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        if not detail:
            detail = f"node 退出码 {proc.returncode}"
        raise RuntimeError(f"久谦通用查询失败：{detail[:4000]}")

    text = (proc.stdout or "").strip()
    if not text:
        raise RuntimeError("久谦通用查询未返回正文（stdout 为空）")
    return text
