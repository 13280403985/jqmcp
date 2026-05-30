"""一次性的 MCP 协议层冒烟测试客户端。

用 fastmcp 自带 Client 走 HTTP transport 连到本地 mcp-server：
  1) 列出所有工具，确认 11 个都登记好；
  2) 调用 meritco_brand_identity 阶段一（只传 query），确认两阶段 API 在协议层可用。

跑法：
  .\.venv\Scripts\python.exe smoke_client.py

需要服务端先在 http://127.0.0.1:8000/mcp/ 起来。
"""
from __future__ import annotations

import asyncio
import os
import sys

from fastmcp import Client


SERVER_URL = os.environ.get("JQMCP_SMOKE_URL", "http://127.0.0.1:8000/mcp/")
QUERY = os.environ.get("JQMCP_SMOKE_QUERY", "蜜雪冰城")


async def main() -> int:
    print(f"[smoke] connecting to {SERVER_URL}")
    async with Client(SERVER_URL) as client:
        # 1) tools/list
        tools = await client.list_tools()
        names = sorted(t.name for t in tools)
        print(f"[smoke] tools/list 返回 {len(names)} 个工具：")
        for n in names:
            print(f"    - {n}")

        expected = {
            "meritco_universal_search",
            "meritco_consumption_scenario_analysis",
            "meritco_user_satisfaction",
            "meritco_emotion_analysis",
            "meritco_market_micro_scene",
            "meritco_product_value_positioning",
            "meritco_compete_discovery",
            "meritco_consumer_journey",
            "meritco_trend_analysis",
            "meritco_element_analysis",
            "meritco_brand_identity",
        }
        missing = expected - set(names)
        if missing:
            print(f"[smoke] [FAIL] 缺失工具：{sorted(missing)}")
            return 2
        print("[smoke] [OK] tools/list 11 个工具齐全")

        # 2) 调 meritco_brand_identity 阶段一
        print(f"\n[smoke] tools/call meritco_brand_identity(query={QUERY!r})")
        result = await client.call_tool("meritco_brand_identity", {"query": QUERY})
        text_pieces: list[str] = []
        for block in (result.content or []):
            t = getattr(block, "text", None)
            if isinstance(t, str):
                text_pieces.append(t)
        out = "\n".join(text_pieces).strip()
        print("[smoke] ====== 返回正文（前 1200 字）======")
        print(out[:1200])
        print("[smoke] ====== /正文 ======")

        if "accountId" in out and "蜜雪冰城" in out and out.count("`") >= 6:
            print("[smoke] [OK] 阶段一返回包含候选 accountId 与品牌名，协议层可用")
            return 0
        print("[smoke] [WARN] 返回不像候选列表，请人工核对上方正文")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
