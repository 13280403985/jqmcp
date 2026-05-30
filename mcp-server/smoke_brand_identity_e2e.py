"""端到端两阶段冒烟：meritco_brand_identity 走 MCP HTTP 协议层。

模拟一个 Agent 的真实使用流程：
  阶段一  call_tool(query="蜜雪冰城")          → 解析候选 markdown 取第 1 个 accountId
  阶段二  call_tool(query="蜜雪冰城", accountId=<刚拿到的>) → 等真正的品牌主张报告

每一步打印耗时和返回正文摘要；只要两阶段都拿到合法返回就算通过。
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import time

from fastmcp import Client


SERVER_URL = os.environ.get("JQMCP_SMOKE_URL", "http://127.0.0.1:8000/mcp/")
QUERY = os.environ.get("JQMCP_SMOKE_QUERY", "蜜雪冰城")
TOOL = "meritco_brand_identity"


def extract_text(result) -> str:
    parts: list[str] = []
    for block in (result.content or []):
        t = getattr(block, "text", None)
        if isinstance(t, str):
            parts.append(t)
    return "\n".join(parts).strip()


def first_account_id(markdown: str) -> str | None:
    """从阶段一返回的 markdown 表格里取第 1 个 `xxx` accountId。"""
    # 表格行形如：| 1 | 蜜雪冰城 | `1997MXBC` | 1.5m | 6.3m |
    m = re.search(r"\|\s*1\s*\|[^|]+\|\s*`([^`]+)`", markdown)
    return m.group(1) if m else None


async def main() -> int:
    print(f"[e2e] connecting to {SERVER_URL}")
    async with Client(SERVER_URL) as client:
        # ===== 阶段一：拿候选 =====
        print(f"\n[e2e] STAGE 1: call_tool({TOOL}, query={QUERY!r})")
        t0 = time.perf_counter()
        r1 = await client.call_tool(TOOL, {"query": QUERY})
        elapsed1 = time.perf_counter() - t0
        text1 = extract_text(r1)
        print(f"[e2e] STAGE 1 耗时 {elapsed1:.1f}s，返回 {len(text1)} 字")
        print("[e2e] --- 阶段一返回 ---")
        print(text1)
        print("[e2e] --- /阶段一 ---")

        account_id = first_account_id(text1)
        if not account_id:
            print("[e2e] [FAIL] 没从阶段一返回里解析出第 1 个 accountId")
            return 2
        print(f"\n[e2e] 从阶段一选定 accountId={account_id!r}")

        # ===== 阶段二：带 accountId 拿真实报告 =====
        print(f"\n[e2e] STAGE 2: call_tool({TOOL}, query={QUERY!r}, accountId={account_id!r})")
        print("[e2e] （预计 60~120s，期间无输出是正常的——Playwright 在跑久谦页面）")
        t0 = time.perf_counter()
        r2 = await client.call_tool(TOOL, {"query": QUERY, "accountId": account_id})
        elapsed2 = time.perf_counter() - t0
        text2 = extract_text(r2)
        print(f"[e2e] STAGE 2 耗时 {elapsed2:.1f}s，返回 {len(text2)} 字")

        # 报告的"通过"标准：包含 "关于...的品牌主张分析" 标题且字数 ≥ 1000
        has_header = bool(re.search(r"关于[\s\S]{1,40}?的品牌主张分析", text2))
        long_enough = len(text2) >= 1000
        print(f"[e2e] STAGE 2 检查：标题命中={has_header} 字数充足={long_enough}（≥1000）")

        # 打印报告前 1500 字和后 500 字，方便人工核对
        print("\n[e2e] --- 阶段二报告 前 1500 字 ---")
        print(text2[:1500])
        print("[e2e] --- ... 中间略 ... ---")
        print(text2[-500:])
        print("[e2e] --- /阶段二报告 ---")

        if has_header and long_enough:
            print(f"\n[e2e] [OK] 两阶段端到端通过：阶段一 {elapsed1:.1f}s + 阶段二 {elapsed2:.1f}s")
            return 0
        print(f"\n[e2e] [FAIL] 阶段二返回不符合预期（header={has_header}, len={len(text2)}）")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
