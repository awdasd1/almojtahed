#!/usr/bin/env python3
"""
خادم MCP (Model Context Protocol) الرسمي للمكتبة الشاملة والتحقيق الشرعي.
يمكن استدعاؤه مباشرة عبر Stdio من:
- Claude Desktop
- Cursor / Windsurf / Zed
- Antigravity / IDEs
"""

import sys
import os
import asyncio
from pathlib import Path

# التأكد من مسار المشروع
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from web_app.mcp_service import mcp_server

def main():
    try:
        asyncio.run(mcp_server.run_stdio_async())
    except KeyboardInterrupt:
        sys.exit(0)

if __name__ == "__main__":
    main()
