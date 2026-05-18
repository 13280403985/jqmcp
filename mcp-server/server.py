"""
久谦通用查询 — 远程 MCP（FastMCP + HTTP/SSE）。

对外暴露 meritco_universal_search；实际查询由项目根目录的 Node + Playwright 执行
（scripts/run-universal.mjs，与本地 MCP stdio 版同源）。

部署前在仓库根目录执行：
  npm install && npm run build && npx playwright install chromium
并配置 meritco.playwright.json、meritco.local.env（或环境变量）。
"""

from __future__ import annotations

import os
import subprocess
import threading
from pathlib import Path

from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

# mcp-server/ 的上一级即 JQMCP 项目根（含 dist、scripts、meritco.playwright.json）
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RUN_UNIVERSAL = PROJECT_ROOT / "scripts" / "run-universal.mjs"

# 与 Node 网关一致：同一时刻只跑一条 Playwright 查询，减轻久谦侧抢会话
_query_lock = threading.Lock()

mcp = FastMCP(
    "jqmcp",
    instructions=(
        "久谦 bot 通用查询 MCP。调用 meritco_universal_search 提交问题，"
        "返回页面生成完成后的报告正文（Playwright 无头抓取）。"
        "拉 history/get 等 HTTP JSON 请使用其它集成，本服务仅提供通用查询。"
    ),
)


def _env_for_node() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("MERITCO_CONFIG_DIR", str(PROJECT_ROOT))
    # 远程部署默认无头；需要弹窗调试时在宿主机设 MERITCO_PLAYWRIGHT_HEADLESS=0
    return env


def _run_node_universal_search(query: str) -> str:
    if not RUN_UNIVERSAL.is_file():
        raise RuntimeError(
            f"未找到 {RUN_UNIVERSAL}。请在项目根目录执行 npm run build。"
        )
    dist_server = PROJECT_ROOT / "dist" / "universalMeritco.js"
    if not dist_server.is_file():
        raise RuntimeError(
            "未找到 dist/universalMeritco.js。请在项目根目录执行：npm run build"
        )

    timeout_sec = int(os.environ.get("MERITCO_QUERY_TIMEOUT_SEC", "600"))
    node = os.environ.get("NODE_BIN", "node")

    with _query_lock:
        proc = subprocess.run(
            [node, str(RUN_UNIVERSAL), query],
            cwd=str(PROJECT_ROOT),
            env=_env_for_node(),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_sec,
        )

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(err or f"Node 进程退出码 {proc.returncode}")

    out = (proc.stdout or "").strip()
    if not out:
        raise RuntimeError("Playwright 未返回正文（stdout 为空）")
    return out


@mcp.custom_route("/health", methods=["GET"])
async def health(_request: Request) -> JSONResponse:
    """供 Railway / 负载均衡探活。"""
    ok = RUN_UNIVERSAL.is_file() and (PROJECT_ROOT / "dist" / "universalMeritco.js").is_file()
    return JSONResponse(
        {
            "status": "healthy" if ok else "degraded",
            "service": "jqmcp-mcp-server",
            "project_root": str(PROJECT_ROOT),
            "node_backend_ready": ok,
        }
    )


@mcp.tool()
def meritco_universal_search(query: str) -> str:
    """
    在久谦 bot「通用查询」中提交问题，等待页面生成后返回报告正文（纯文本）。

    服务端通过 Playwright 无头浏览器完成，无需调用方自行开浏览器。
    仅参数 query 有效。
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("query 不能为空")
    return _run_node_universal_search(q)


def _host_port() -> tuple[str, int]:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    return host, port


if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "http").strip().lower()
    host, port = _host_port()

    if transport == "sse":
        mcp.run(transport="sse", host=host, port=port)
    elif transport == "stdio":
        mcp.run(transport="stdio")
    else:
        # 默认 HTTP；端点一般为 http://<host>:<port>/mcp/
        mcp.run(transport="http", host=host, port=port)
