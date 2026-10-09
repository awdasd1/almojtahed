import os
import sys
import json
import time
import shutil
import urllib.request
import urllib.error
import urllib.parse
import subprocess
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

def find_chrome_binary():
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser"
    ]
    for c in candidates:
        if os.path.isabs(c) and os.path.exists(c) and os.access(c, os.X_OK):
            return c
        w = shutil.which(c)
        if w:
            return w
    return None

PORT = 5173
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Global State for MCP Server Bridge
mcp_active_type = "stdio" # "stdio" or "remote"
mcp_active_url = None
mcp_process = None
mcp_process_lock = threading.Lock()
mcp_active_config = None
mcp_tools_cache = []
mcp_request_counter = 1

# OpenRouter Models Cache
openrouter_cache = {
    "timestamp": 0,
    "models": []
}

SAVED_KEYS_FILE = os.path.join(BASE_DIR, "saved_keys.json")

def get_persisted_key(provider="openrouter"):
    # 1. Environment variable
    env_key = os.environ.get(f"{provider.upper()}_API_KEY")
    if env_key:
        return env_key.strip()
    # 2. saved_keys.json
    if os.path.exists(SAVED_KEYS_FILE):
        try:
            with open(SAVED_KEYS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                val = data.get(provider, "")
                if val:
                    return val.strip()
        except Exception:
            pass
    # 3. check ../web_app/api_keys.json
    shared_file = os.path.abspath(os.path.join(BASE_DIR, "..", "web_app", "api_keys.json"))
    if os.path.exists(shared_file):
        try:
            with open(shared_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                val = data.get(provider, "") or data.get("openrouter_api_key", "")
                if val:
                    return val.strip()
        except Exception:
            pass
    return ""

def persist_key(provider, key):
    data = {}
    if os.path.exists(SAVED_KEYS_FILE):
        try:
            with open(SAVED_KEYS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    data[provider] = (key or "").strip()
    with open(SAVED_KEYS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_next_mcp_id():
    global mcp_request_counter
    with mcp_process_lock:
        mcp_request_counter += 1
        return mcp_request_counter

def send_remote_mcp_rpc(url, method, params=None, is_notification=False, timeout=60):
    payload = {
        "jsonrpc": "2.0",
        "method": method
    }
    if not is_notification:
        payload["id"] = get_next_mcp_id()
    if params is not None:
        payload["params"] = params

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Claude-Desktop-Web-MCP/1.0"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if is_notification:
            return None
        raw_body = resp.read().decode("utf-8")
        if not raw_body.strip():
            return None
        resp_data = json.loads(raw_body)
        if "error" in resp_data:
            err_msg = resp_data["error"].get("message") if isinstance(resp_data["error"], dict) else str(resp_data["error"])
            raise RuntimeError(err_msg or "خطأ في خادم MCP البعيد")
        return resp_data.get("result")

def connect_remote_mcp_server(url):
    global mcp_process, mcp_active_type, mcp_active_url, mcp_active_config, mcp_tools_cache

    url = url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url

    with mcp_process_lock:
        # If there is a local stdio process running, stop it
        if mcp_process and mcp_process.poll() is None:
            try:
                mcp_process.terminate()
                mcp_process.wait(timeout=1.0)
            except Exception:
                try:
                    mcp_process.kill()
                except Exception:
                    pass
        mcp_process = None

    print(f"[MCP Bridge] Connecting to remote MCP server: {url}")
    # Perform initialize handshake
    init_res = send_remote_mcp_rpc(url, "initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "claude-desktop-web", "version": "1.0.0"}
    }, timeout=30)

    # Send initialized notification if possible
    try:
        send_remote_mcp_rpc(url, "notifications/initialized", {}, is_notification=True, timeout=10)
    except Exception:
        pass

    # Discover tools
    tools_res = send_remote_mcp_rpc(url, "tools/list", {}, timeout=45)
    tools = tools_res.get("tools", []) if tools_res else []

    with mcp_process_lock:
        mcp_active_type = "remote"
        mcp_active_url = url
        mcp_tools_cache = tools
        server_info = init_res.get("serverInfo", {}) if init_res else {"name": "خادم MCP بعيد"}
        mcp_active_config = {
            "type": "remote",
            "url": url,
            "serverInfo": server_info,
            "toolsCount": len(tools)
        }

    print(f"[MCP Bridge] Successfully connected to remote MCP: {len(tools)} tools discovered.")
    return {
        "serverInfo": mcp_active_config["serverInfo"],
        "tools": tools
    }

def send_mcp_rpc(method, params=None, is_notification=False):
    global mcp_process
    if not mcp_process or mcp_process.poll() is not None:
        raise RuntimeError("خادم MCP غير متصل أو تم إنهاء عمليته")

    req_id = None if is_notification else get_next_mcp_id()
    payload = {
        "jsonrpc": "2.0",
        "method": method
    }
    if req_id is not None:
        payload["id"] = req_id
    if params is not None:
        payload["params"] = params

    json_str = json.dumps(payload) + "\n"
    
    with mcp_process_lock:
        try:
            mcp_process.stdin.write(json_str)
            mcp_process.stdin.flush()
            if is_notification:
                return None
            
            # Read response line
            line = mcp_process.stdout.readline()
            if not line:
                stderr_output = ""
                try:
                    if mcp_process and mcp_process.stderr:
                        stderr_output = mcp_process.stderr.read()
                except Exception:
                    pass
                raise RuntimeError(f"انقطع الاتصال بخادم MCP: {stderr_output or 'لا يوجد خرج من العملية'}")
            
            resp = json.loads(line)
            if "error" in resp:
                raise RuntimeError(resp["error"].get("message", "خطأ في MCP RPC"))
            return resp.get("result")
        except Exception as e:
            raise RuntimeError(f"خطأ أثناء التخاطب مع MCP: {e}")

def connect_mcp_server(command, args=None, env_vars=None):
    global mcp_process, mcp_active_type, mcp_active_url, mcp_active_config, mcp_tools_cache
    
    # 1. Reuse existing healthy process if the same configuration is requested
    if mcp_active_type == "stdio" and mcp_process and mcp_process.poll() is None and mcp_tools_cache:
        target_args = args or []
        if mcp_active_config and mcp_active_config.get("command") == command and mcp_active_config.get("args") == target_args:
            return {
                "serverInfo": mcp_active_config.get("serverInfo", {}),
                "tools": mcp_tools_cache
            }

    with mcp_process_lock:
        # Terminate previous if running
        if mcp_process and mcp_process.poll() is None:
            try:
                mcp_process.terminate()
                mcp_process.wait(timeout=1.5)
            except Exception:
                try:
                    mcp_process.kill()
                except Exception:
                    pass

        mcp_process = None
        mcp_tools_cache = []
        mcp_active_url = None

        cmd_list = [command]
        if args and isinstance(args, list):
            cmd_list.extend(args)

        env = os.environ.copy()
        if env_vars and isinstance(env_vars, dict):
            env.update(env_vars)
        env["PYTHONUNBUFFERED"] = "1"

        try:
            mcp_process = subprocess.Popen(
                cmd_list,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                env=env
            )
        except Exception as e:
            raise RuntimeError(f"تعذر تشغيل أمر خادم MCP ({command}): {e}")

    # Perform initialize handshake
    init_res = send_mcp_rpc("initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "claude-desktop-web", "version": "1.0.0"}
    })
    
    # Send initialized notification
    send_mcp_rpc("notifications/initialized", is_notification=True)

    # Discover tools
    tools_res = send_mcp_rpc("tools/list", {})
    tools = tools_res.get("tools", []) if tools_res else []

    with mcp_process_lock:
        mcp_active_type = "stdio"
        mcp_active_url = None
        mcp_tools_cache = tools
        mcp_active_config = {
            "type": "stdio",
            "command": command,
            "args": args or [],
            "serverInfo": init_res.get("serverInfo", {}),
            "toolsCount": len(tools)
        }

    return {
        "serverInfo": init_res.get("serverInfo", {}),
        "tools": tools
    }

def is_mcp_connected():
    global mcp_active_type, mcp_active_url, mcp_process, mcp_tools_cache
    if mcp_active_type == "remote":
        return bool(mcp_active_url and mcp_tools_cache)
    if mcp_active_type == "stdio":
        return bool(mcp_process and mcp_process.poll() is None and mcp_tools_cache)
    return False

def call_mcp_tool(tool_name, arguments):
    global mcp_active_type, mcp_active_url
    if mcp_active_type == "remote" and mcp_active_url:
        res = send_remote_mcp_rpc(mcp_active_url, "tools/call", {
            "name": tool_name,
            "arguments": arguments or {}
        }, timeout=90)
        return res
    else:
        res = send_mcp_rpc("tools/call", {
            "name": tool_name,
            "arguments": arguments or {}
        })
        return res

def fetch_openrouter_models():
    global openrouter_cache
    now = time.time()
    # Cache for 10 minutes
    if openrouter_cache["models"] and (now - openrouter_cache["timestamp"] < 600):
        return openrouter_cache["models"]

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/models",
        headers={"User-Agent": "Claude-Desktop-Web/1.0"}
    )
    with urllib.request.urlopen(req, timeout=12) as response:
        data = json.loads(response.read().decode("utf-8"))
        models = data.get("data", [])
        openrouter_cache["models"] = models
        openrouter_cache["timestamp"] = now
        return models

class ClaudeAppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS and disable caching for development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, status_code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed_path = self.path.split("?")[0]

        if parsed_path == "/api/openrouter/models":
            try:
                models = fetch_openrouter_models()
                self.send_json(200, {
                    "success": True,
                    "count": len(models),
                    "models": models
                })
            except Exception as e:
                self.send_json(500, {"success": False, "error": str(e)})
            return

        if parsed_path == "/api/shamela/agents":
            try:
                base_dir = Path(__file__).resolve().parent.parent / "web_app"
                default_file = base_dir / "default_assistants.json"
                user_file = base_dir / "user_assistants.json"
                
                assistants_map = {}
                if default_file.exists():
                    try:
                        with open(default_file, "r", encoding="utf-8") as f:
                            for a in json.load(f):
                                if a.get("id"):
                                    assistants_map[str(a["id"]).lower()] = a
                    except Exception:
                        pass
                
                if user_file.exists():
                    try:
                        with open(user_file, "r", encoding="utf-8") as f:
                            for a in json.load(f):
                                aid = str(a.get("id", "")).lower()
                                if aid and aid != "ast_usul_jadid":
                                    assistants_map[aid] = a
                    except Exception:
                        pass

                agents_list = []
                for a in assistants_map.values():
                    b_titles = a.get("book_titles", [])
                    agents_list.append({
                        "id": str(a.get("id")),
                        "name": a.get("name"),
                        "role": a.get("role"),
                        "default_model": a.get("model"),
                        "default_provider": a.get("provider", "openrouter"),
                        "books_count": len(b_titles),
                        "book_titles": b_titles,
                        "enabled": a.get("enabled", True),
                        "is_custom": a.get("is_custom", False) or str(a.get("id", "")).startswith("ast_")
                    })

                self.send_json(200, {
                    "status": "success",
                    "total": len(agents_list),
                    "agents": agents_list
                })
            except Exception as e:
                self.send_json(500, {"status": "error", "error": str(e)})
            return

        if parsed_path == "/api/settings/get-key":
            provider = "openrouter"
            key = get_persisted_key(provider)
            self.send_json(200, {
                "success": True,
                "hasKey": bool(key),
                "apiKey": key if key else ""
            })
            return

        if parsed_path == "/api/mcp/status":
            connected = is_mcp_connected()
            self.send_json(200, {
                "connected": connected,
                "type": mcp_active_type,
                "config": mcp_active_config if connected else None,
                "tools": mcp_tools_cache if connected else []
            })
            return

        super().do_GET()

    def do_POST(self):
        parsed_path = self.path.split("?")[0]
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        
        try:
            body = json.loads(post_data)
        except Exception:
            body = {}

        if parsed_path == "/api/settings/save-key":
            provider = body.get("provider", "openrouter")
            key = (body.get("apiKey") or "").strip()
            if key:
                persist_key(provider, key)
            self.send_json(200, {"success": True})
            return

        if parsed_path == "/api/export/pdf":
            try:
                html = body.get("html", "")
                if not html:
                    self.send_json(400, {"success": False, "error": "HTML content required"})
                    return
                
                filename = body.get("filename", "research.pdf")
                import re
                ascii_clean = re.sub(r'[^\x00-\x7F]+', '', filename).strip('._')
                ascii_filename = f"{ascii_clean}.pdf" if ascii_clean else "document.pdf"
                safe_ascii_filename = urllib.parse.quote(filename.encode("utf-8"))
                
                chrome_path = find_chrome_binary()
                pdf_bytes = None
                
                if chrome_path:
                    import tempfile
                    with tempfile.NamedTemporaryFile("w", suffix=".html", encoding="utf-8", delete=False) as tf:
                        tf.write(html)
                        temp_html_path = tf.name
                    
                    temp_pdf_path = temp_html_path.replace(".html", ".pdf")
                    try:
                        cmd = [
                            chrome_path,
                            "--headless=new",
                            "--disable-gpu",
                            "--no-pdf-header-footer",
                            f"--print-to-pdf={temp_pdf_path}",
                            temp_html_path
                        ]
                        proc = subprocess.run(cmd, capture_output=True, timeout=35)
                        if os.path.exists(temp_pdf_path) and os.path.getsize(temp_pdf_path) > 0:
                            with open(temp_pdf_path, "rb") as pf:
                                pdf_bytes = pf.read()
                        else:
                            err_msg = proc.stderr.decode("utf-8", errors="ignore")
                            print(f"[Chrome PDF Warning] {err_msg}")
                    finally:
                        try:
                            if os.path.exists(temp_html_path): os.unlink(temp_html_path)
                            if os.path.exists(temp_pdf_path): os.unlink(temp_pdf_path)
                        except Exception:
                            pass

                if not pdf_bytes:
                    try:
                        from playwright.sync_api import sync_playwright
                        with sync_playwright() as p:
                            browser = p.chromium.launch(headless=True)
                            page = browser.new_page()
                            page.set_content(html, wait_until="networkidle")
                            pdf_bytes = page.pdf(
                                format="A4",
                                print_background=True,
                                prefer_css_page_size=True
                            )
                            browser.close()
                    except Exception as p_err:
                        raise RuntimeError(f"تعذر إنشاء ملف PDF تلقائياً عبر المتصفح: {p_err}")

                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Disposition", f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{safe_ascii_filename}')
                self.send_header("Content-Length", str(len(pdf_bytes)))
                self.end_headers()
                self.wfile.write(pdf_bytes)
                return
            except Exception as e:
                print(f"[PDF Export Error] {e}")
                self.send_json(500, {"success": False, "error": str(e)})
                return

        if parsed_path == "/api/mcp/connect":
            try:
                url = body.get("url")
                cmd = body.get("command")
                args = body.get("args", [])
                env = body.get("env", {})

                # If wrapped inside { "mcpServers": { ... } }
                if "mcpServers" in body and isinstance(body["mcpServers"], dict):
                    server_key = list(body["mcpServers"].keys())[0]
                    server_cfg = body["mcpServers"][server_key]
                    if not url:
                        url = server_cfg.get("url")
                    if not cmd:
                        cmd = server_cfg.get("command")
                        args = server_cfg.get("args", [])
                        env = server_cfg.get("env", {})

                # If command is accidentally a URL
                if cmd and (cmd.startswith("http://") or cmd.startswith("https://")):
                    url = cmd
                    cmd = None

                if url:
                    res = connect_remote_mcp_server(url)
                elif cmd:
                    res = connect_mcp_server(cmd, args, env)
                else:
                    self.send_json(400, {"success": False, "error": "مطلوب إما رابط URL أو أمر تشغيل command لخادم MCP"})
                    return

                self.send_json(200, {
                    "success": True,
                    "serverInfo": res["serverInfo"],
                    "toolsCount": len(res["tools"]),
                    "tools": res["tools"]
                })
            except Exception as e:
                self.send_json(500, {"success": False, "error": str(e)})
            return

        if parsed_path == "/api/mcp/call":
            try:
                tool_name = body.get("name")
                arguments = body.get("arguments", {})
                if not tool_name:
                    self.send_json(400, {"success": False, "error": "name is required"})
                    return
                output = call_mcp_tool(tool_name, arguments)
                self.send_json(200, {"success": True, "result": output})
            except Exception as e:
                self.send_json(500, {"success": False, "error": str(e)})
            return

        if parsed_path == "/api/chat":
            try:
                result = self.handle_chat_completion(body)
                self.send_json(200, result)
            except Exception as e:
                self.send_json(500, {"success": False, "error": str(e)})
            return

        self.send_json(404, {"error": "Not Found"})

    def handle_chat_completion(self, body):
        import re
        provider = body.get("provider", "openrouter")
        api_key = (body.get("apiKey") or "").strip()
        if not api_key:
            api_key = get_persisted_key(provider)
        if not api_key:
            api_key = get_persisted_key("openrouter")

        model = body.get("model", "deepseek/deepseek-r1")
        messages = body.get("messages", [])
        system_prompt = body.get("systemPrompt", "")
        temperature = float(body.get("temperature", 0.7))
        enable_mcp = body.get("enableMcp", True)
        enable_rag = body.get("enableRag", True)
        rag_agent_id = body.get("ragAgentId", "shatibi")
        mcp_limit = int(body.get("mcpLimit", 15))
        mcp_limit = max(1, min(mcp_limit, 50))
        mcp_book_diversity = bool(body.get("mcpBookDiversity", True))
        mcp_window_expansion = bool(body.get("mcpWindowExpansion", True))

        assistant_consultations_data = []
        rag_context_injected = ""
        if enable_rag:
            try:
                last_user_query = ""
                for m in reversed(messages):
                    if m.get("role") == "user":
                        last_user_query = m.get("content", "")
                        break
                
                if last_user_query:
                    rag_ids_input = body.get("ragAgentIds")
                    agent_ids_param = None
                    agent_id_param = None
                    if rag_ids_input and isinstance(rag_ids_input, list):
                        agent_ids_param = [str(x).strip() for x in rag_ids_input if str(x).strip()]
                    elif rag_agent_id and "," in str(rag_agent_id):
                        agent_ids_param = [s.strip() for s in str(rag_agent_id).split(",") if s.strip()]
                    else:
                        agent_id_param = rag_agent_id or "all"

                    openrouter_key = api_key if (provider == "openrouter" and api_key) else (get_persisted_key("openrouter") or api_key)
                    rag_payload = {
                        "query": last_user_query,
                        "provider": "openrouter",
                        "api_key": openrouter_key,
                        "model": "google/gemini-2.5-flash",
                        "limit": 6
                    }
                    if agent_ids_param:
                        rag_payload["agent_ids"] = agent_ids_param
                    else:
                        rag_payload["agent_id"] = agent_id_param

                    rag_req_data = json.dumps(rag_payload).encode("utf-8")
                    
                    r_req = urllib.request.Request(
                        "http://localhost:8000/api/ai/agent/query",
                        data=rag_req_data,
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(r_req, timeout=45) as r_resp:
                        r_data = json.loads(r_resp.read().decode("utf-8"))
                        r_sources = r_data.get("sources", [])
                        agent_info = r_data.get("agent", {})
                        sub_results = r_data.get("results", [])
                        combined_answer = r_data.get("answer", "")

                        assistant_reports_blocks = []
                        if sub_results and isinstance(sub_results, list) and len(sub_results) > 0:
                            for sr in sub_results:
                                a_cfg = sr.get("agent", {})
                                a_name = a_cfg.get("name", "النموذج المساعد")
                                a_role = a_cfg.get("role", "")
                                a_ans = sr.get("answer", "").strip()
                                if a_ans and not a_ans.startswith("تعذر استنطاق"):
                                    assistant_reports_blocks.append(
                                        f"🎙️ [تقرير استشاري تخصصي من {a_name} - ({a_role})]:\n{a_ans}"
                                    )
                                    assistant_consultations_data.append({
                                        "name": a_name,
                                        "role": a_role,
                                        "report": a_ans
                                    })
                        elif combined_answer and not combined_answer.startswith("تم استرجاع"):
                            assistant_reports_blocks.append(f"🎙️ [تقرير استشاري تخصصي من {agent_info.get('name', 'الوكيل المساعد')}]:\n{combined_answer}")
                            assistant_consultations_data.append({
                                "name": agent_info.get("name", "الوكيل المساعد"),
                                "role": agent_info.get("role", ""),
                                "report": combined_answer
                            })

                        sources_blocks = []
                        if r_sources:
                            for s in r_sources:
                                cit = s.get("citation") or s.get("book_title", "")
                                snippet = s.get("snippet", "")
                                sources_blocks.append(f"• [{cit}]:\n«{snippet}»")

                        sections = []
                        if assistant_reports_blocks:
                            sections.append(
                                "### [تقارير واستخلاصات فريق النماذج المساعدة المتخصصة]:\n" + 
                                "\n\n".join(assistant_reports_blocks)
                            )
                        if sources_blocks:
                            sections.append(
                                "### [نصوص المكتبة الشاملة المعتمدة المعزوة]:\n" + 
                                "\n".join(sources_blocks)
                            )
                        
                        if sections:
                            rag_context_injected = "\n\n---\n\n".join(sections)
            except Exception as rag_err:
                print(f"[RAG Bridge Warning] {rag_err}")

        chat_messages = []
        full_system = system_prompt or ""
        if rag_context_injected:
            full_system = f"""{rag_context_injected}

تعليمات تحريرية وإلزامية للنموذج الأساسي:
أنت الباحث المشرف العام والمحرر النهائي. تم استنطاق فريق النماذج المساعدة المتخصصة المحددة واستخراج نصوص الشاملة الموثقة أعلاه.
مهمتك:
1. دراسة استخلاصات وتقارير النماذج المساعدة المرفقة بدقة والاستفادة التامة من تخصص كل منهم (بيان لغة الفقهاء، تخريج الأحاديث، تحرير المذاهب، القواعد الأصولية).
2. صياغة إجابة علمية تحريرية متكاملة ورصينة مستوعبة لكافة جوانب المسألة، مع عزو كل مسألة إلى مصدرها الصريح (الكتاب، الجزء، الصفحة).

{full_system}"""

        if full_system:
            chat_messages.append({"role": "system", "content": full_system})
        for m in messages:
            chat_messages.append({"role": m["role"], "content": m["content"]})

        tools_param = None
        tool_invocations = []
        is_connected = is_mcp_connected()

        # Auto-reconnect if MCP was dropped
        if enable_mcp and not is_connected:
            if mcp_active_type == "remote" and mcp_active_url:
                try:
                    connect_remote_mcp_server(mcp_active_url)
                    is_connected = is_mcp_connected()
                except Exception as rex:
                    print(f"Auto-reconnect remote MCP failed: {rex}")
            elif not mcp_active_config:
                default_shamela_py = "/Users/maa/Shamela Snapshot/shamela_mcp.py"
                default_shamela_venv = "/Users/maa/Shamela Snapshot/.venv/bin/python"
                if os.path.exists(default_shamela_py) and os.path.exists(default_shamela_venv):
                    try:
                        connect_mcp_server(default_shamela_venv, [default_shamela_py], {"PYTHONUNBUFFERED": "1"})
                        is_connected = is_mcp_connected()
                    except Exception as ex:
                        print(f"Auto-reconnect Shamela MCP failed: {ex}")
        
        if enable_mcp and is_connected and mcp_tools_cache:
            tools_param = []
            for t in mcp_tools_cache:
                tools_param.append({
                    "type": "function",
                    "function": {
                        "name": t.get("name"),
                        "description": t.get("description", ""),
                        "parameters": t.get("inputSchema", {"type": "object", "properties": {}})
                    }
                })

        if not api_key:
            raise ValueError(f"لم يتم العثور على مفتاح API الخاص بـ {provider}. يرجى إدخال مفتاح API من زر الإعدادات ⚙️ أعلى الواجهة لتفعيل الاتصال والنماذج.")

        if provider == "openrouter":
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "http://localhost:5173",
                "X-Title": "Claude Desktop Web"
            }
        elif provider == "openai":
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
        elif provider == "anthropic":
            or_key = get_persisted_key("openrouter")
            if or_key:
                url = "https://openrouter.ai/api/v1/chat/completions"
                api_key = or_key
                if not model.startswith("anthropic/"):
                    model = "anthropic/claude-3.7-sonnet"
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Claude Desktop Web"
                }
            else:
                raise ValueError("لتشغيل نموذج Claude عبر خادم الأدوات والنماذج المساعدة، يرجى حفظ مفتاح OpenRouter في الإعدادات ⚙️.")
        else:
            raise ValueError(f"مزود الخدمة المختار {provider} غير مدعوم حالياً في خادم الأدوات")

        # Clean tool output formatter to avoid massive raw JSON blowing up the context window
        def clean_tool_response(raw_res, limit=mcp_limit):
            try:
                raw_str = ""
                if isinstance(raw_res, dict):
                    if "content" in raw_res and isinstance(raw_res["content"], list):
                        raw_str = "\n".join([item.get("text", "") for item in raw_res["content"] if isinstance(item, dict)])
                    else:
                        raw_str = json.dumps(raw_res, ensure_ascii=False)
                else:
                    raw_str = str(raw_res)

                data = json.loads(raw_str) if isinstance(raw_str, str) else raw_str
                if isinstance(data, dict) and "results" in data:
                    res_list = data["results"]
                    total = data.get("total", len(res_list))
                    effective_count = min(limit, len(res_list))
                    lines = [f"استخراج نصوص موثقة ({effective_count} من أصل {total} نتيجة):"]
                    for idx, r in enumerate(res_list[:effective_count], 1):
                        b_title = r.get("book") or r.get("title", "")
                        b_author = r.get("author", "")
                        death_val = r.get("death") or r.get("author_death_hijri")
                        death = f" (ت: {death_val})" if death_val and death_val != 99999 else ""
                        b_loc = r.get("location") or " - ".join(filter(bool, [f"ج {r.get('part')}" if r.get('part') else "", f"ص {r.get('page_num')}" if r.get('page_num') else ""]))
                        snippet = r.get("full_body") or r.get("snippet", "")
                        clean_snippet = re.sub(r"<[^>]+>", "", snippet).strip()
                        lines.append(f"\n[{idx}] كتاب: {b_title} | المؤلف: {b_author}{death} | {b_loc}\nالنص الموثق:\n«{clean_snippet}»")
                    return "\n".join(lines)
                elif isinstance(data, dict):
                    return raw_str[:60000]
            except Exception:
                pass
            return re.sub(r"<[^>]+>", "", str(raw_res))[:60000]

        # Standard Multi-turn Agent Tool Loop
        tool_invocations = []
        max_turns = 4
        final_answer = ""

        for turn in range(max_turns):
            payload = {
                "model": model,
                "messages": chat_messages,
                "temperature": temperature,
                "max_tokens": 8192
            }
            # Only provide tools for early turns; on the final turn force natural text completion
            if tools_param and turn < max_turns - 1:
                payload["tools"] = tools_param
                payload["tool_choice"] = "auto"

            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=140) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8")
                raise RuntimeError(f"HTTP {e.code}: {err_body}")

            choice = data.get("choices", [{}])[0]
            assistant_message = choice.get("message", {})
            tool_calls = assistant_message.get("tool_calls")
            content = assistant_message.get("content") or assistant_message.get("reasoning_content") or ""
            finish_reason = choice.get("finish_reason")

            print(f"[Agent Turn {turn+1}] tool_calls={len(tool_calls) if tool_calls else 0}, content_len={len(content)}, finish_reason={finish_reason}")

            # Detect text-based function calls produced by reasoning models (like DeepSeek R1: !function_call:{...})
            if not tool_calls and content.strip():
                fn_match = re.search(r'!function_call:\s*(\{.*?\})', content, re.DOTALL)
                if fn_match:
                    try:
                        p_call = json.loads(fn_match.group(1))
                        f_name = p_call.get("call") or p_call.get("name")
                        f_args = p_call.get("arguments", {})
                        if f_name:
                            tool_calls = [{
                                "id": f"call_{turn}_{f_name}",
                                "type": "function",
                                "function": {
                                    "name": f_name,
                                    "arguments": f_args
                                }
                            }]
                    except Exception as p_err:
                        print(f"Failed to parse text function call: {p_err}")

            # If no tool calls requested and model generated text, we have the answer!
            if not tool_calls and content.strip():
                final_answer = content

                # If model hit length limit, automatically request continuation to complete the essay!
                if finish_reason == "length":
                    print("[Agent Continuation] Model hit max_tokens length limit, continuing generation seamlessly...")
                    chat_messages.append(assistant_message)
                    chat_messages.append({
                        "role": "user",
                        "content": "تابع وأكمل التحرير العلمي بدقة واستيعاب تام من حيث توقفت مباشرة، مع استعراض بقية الأقوال والمذاهب والأدلة ومناقشتها وعزوها."
                    })
                    payload_cont = {
                        "model": model,
                        "messages": chat_messages,
                        "temperature": temperature,
                        "max_tokens": 8192
                    }
                    try:
                        req_cont = urllib.request.Request(url, data=json.dumps(payload_cont).encode("utf-8"), headers=headers, method="POST")
                        with urllib.request.urlopen(req_cont, timeout=140) as resp_cont:
                            data_cont = json.loads(resp_cont.read().decode("utf-8"))
                            c_cont = data_cont.get("choices", [{}])[0]
                            cont_text = c_cont.get("message", {}).get("content") or ""
                            final_answer = final_answer + "\n\n" + cont_text
                    except Exception as cont_err:
                        print(f"Continuation error: {cont_err}")

                break

            # If model made tool calls: append assistant message as required by API specification
            if tool_calls:
                chat_messages.append(assistant_message)

                for tc in tool_calls:
                    call_id = tc.get("id")
                    fn = tc.get("function", {})
                    fn_name = fn.get("name")
                    fn_args_str = fn.get("arguments", "{}")
                    try:
                        fn_args = json.loads(fn_args_str) if isinstance(fn_args_str, str) else fn_args_str
                    except Exception:
                        fn_args = {}

                    # Enforce user depth options when executing Shamela text searches
                    if fn_name in ("search_shamela_text", "mcp_search_shamela_text"):
                        if not fn_args.get("limit") or fn_args.get("limit") < mcp_limit:
                            fn_args["limit"] = mcp_limit
                        if "book_diversity" not in fn_args:
                            fn_args["book_diversity"] = mcp_book_diversity
                        if "window_expansion" not in fn_args:
                            fn_args["window_expansion"] = mcp_window_expansion

                    print(f"[Agent Turn {turn+1}] Executing MCP Tool: {fn_name}({fn_args})")
                    try:
                        raw_tool_output = call_mcp_tool(fn_name, fn_args)
                        formatted_tool_output = clean_tool_response(raw_tool_output, limit=mcp_limit)
                    except Exception as ex:
                        formatted_tool_output = f"خطأ في تنفيذ الأداة {fn_name}: {ex}"

                    tool_invocations.append({
                        "name": fn_name,
                        "arguments": fn_args,
                        "preview": formatted_tool_output[:400]
                    })

                    # Append tool result to conversation matching the tool_call_id
                    chat_messages.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": fn_name,
                        "content": formatted_tool_output
                    })
            else:
                # No tool calls and content was empty; break to trigger synthesis prompt
                break

        # If loop finished and final_answer is empty, prompt model for scholarly synthesis from gathered results
        if not final_answer:
            print("[Agent Synthesis] Synthesizing final essay from gathered tool results...")
            synthesis_messages = list(chat_messages)
            synthesis_messages.append({
                "role": "user",
                "content": "الآن بناءً على كافة نصوص الشاملة والنتائج الأصولية المستخرجة أعلاه، اكتب التحرير العلمي الأصولي الشامل والمستوعب للمسألة بأعلى درجات الاستيعاب والتحقيق، مع نسبة الأقوال لأصحابها وعزوها لكتبهم بدقة (الكتاب والمؤلف والجزء والصفحة)."
            })
            payload_last = {
                "model": model,
                "messages": synthesis_messages,
                "temperature": temperature,
                "max_tokens": 8192
            }
            req_last = urllib.request.Request(url, data=json.dumps(payload_last).encode("utf-8"), headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req_last, timeout=140) as resp_last:
                    data_last = json.loads(resp_last.read().decode("utf-8"))
                    c_last = data_last.get("choices", [{}])[0]
                    final_answer = c_last.get("message", {}).get("content") or c_last.get("message", {}).get("reasoning_content") or ""
                    finish_reason = c_last.get("finish_reason")

                    # If model hit output token limit, automatically request continuation to complete the research
                    continuation_count = 0
                    while finish_reason == "length" and continuation_count < 3:
                        continuation_count += 1
                        print(f"[Agent Continuation {continuation_count}] Output reached max_tokens length limit, continuing generation seamlessly...")
                        synthesis_messages.append({"role": "assistant", "content": final_answer})
                        synthesis_messages.append({
                            "role": "user",
                            "content": "تابع وأكمل البحث الأصولي من حيث توقفت مباشرة دون تكرار ما سبق (أكمل بقية القواعد الأصولية، والترجيح، وخاتمة المسألة، وقائمة المراجع الموثقة)."
                        })
                        payload_cont = {
                            "model": model,
                            "messages": synthesis_messages,
                            "temperature": temperature,
                            "max_tokens": 8192
                        }
                        try:
                            req_cont = urllib.request.Request(url, data=json.dumps(payload_cont).encode("utf-8"), headers=headers, method="POST")
                            with urllib.request.urlopen(req_cont, timeout=140) as resp_cont:
                                data_cont = json.loads(resp_cont.read().decode("utf-8"))
                                c_cont = data_cont.get("choices", [{}])[0]
                                cont_text = c_cont.get("message", {}).get("content") or c_cont.get("message", {}).get("reasoning_content") or ""
                                if cont_text:
                                    final_answer = final_answer + "\n\n" + cont_text.strip()
                                finish_reason = c_cont.get("finish_reason")
                        except Exception as cont_err:
                            print(f"Synthesis continuation error: {cont_err}")
                            break
            except Exception as ex:
                print(f"Final synthesis error: {ex}")

        # Fallback if model still produced nothing: construct answer from tool invocations
        if not final_answer and tool_invocations:
            print("[Agent Synthesis] Compiling fallback excerpts...")
            lines = ["### نصوص وتخريجات المسألة من المكتبة الشاملة:\n"]
            for inv in tool_invocations:
                lines.append(f"#### أداة: {inv['name']} ({json.dumps(inv['arguments'], ensure_ascii=False)})\n{inv['preview']}\n")
            final_answer = "\n".join(lines)

        return {
            "success": True,
            "content": final_answer,
            "toolInvocations": tool_invocations,
            "assistantConsultations": assistant_consultations_data
        }

if __name__ == "__main__":
    print(f"Starting Claude Desktop Web Bridge Server on port {PORT}...")

    # Auto-connect to Shamela MCP if present
    default_shamela_py = "/Users/maa/Shamela Snapshot/shamela_mcp.py"
    default_shamela_venv = "/Users/maa/Shamela Snapshot/.venv/bin/python"
    if os.path.exists(default_shamela_py) and os.path.exists(default_shamela_venv):
        print(f"Found Shamela MCP script at {default_shamela_py}, connecting...")
        try:
            connect_mcp_server(default_shamela_venv, [default_shamela_py], {"PYTHONUNBUFFERED": "1"})
            print(f"✓ Shamela MCP connected successfully with {len(mcp_tools_cache)} tools!")
        except Exception as e:
            print(f"Notice: Shamela MCP auto-connect: {e}")

    server = HTTPServer(("0.0.0.0", PORT), ClaudeAppHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        if mcp_process:
            mcp_process.kill()
        sys.exit(0)
