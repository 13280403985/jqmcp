"""
远程 HTTP MCP 请使用 mcp-server/ 目录：

  cd mcp-server
  pip install -r requirements.txt
  python server.py

详见 mcp-server/README.md
"""

if __name__ == "__main__":
    import runpy
    from pathlib import Path

    runpy.run_path(str(Path(__file__).resolve().parent / "mcp-server" / "server.py"), run_name="__main__")
