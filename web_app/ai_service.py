"""
ai_service.py
خدمة التكامل مع نماذج الذكاء الاصطناعي (OpenAI, Gemini, Claude, OpenRouter)
ومحرك استرجاع السياق التراثي (RAG) وتصدير التقارير (Word, PDF, CraftMyPDF)
"""

import os
import io
import re
import json
import time
import asyncio
import httpx
from typing import List, Dict, Any, Optional, Callable, Coroutine, Union
from pathlib import Path
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

BASE_DIR = Path(__file__).resolve().parent.parent

# القوائم الافتراضية للنماذج لكل مزود
CURATED_MODELS = {
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "o1-mini",
        "o1-preview"
    ],
    "google": [
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-2.0-flash-exp",
        "gemini-1.5-flash-8b"
    ],
    "anthropic": [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229"
    ],
    "openrouter": [
        "deepseek/deepseek-r1",
        "deepseek/deepseek-chat",
        "meta-llama/llama-3.3-70b-instruct",
        "anthropic/claude-3.5-sonnet",
        "google/gemini-pro-1.5",
        "openai/gpt-4o"
    ],
    "ollama": [
        "qwen2.5:7b",
        "qwen2.5:14b",
        "qwen2.5:32b",
        "deepseek-r1:7b",
        "deepseek-r1:8b",
        "deepseek-r1:14b",
        "llama3.1:8b",
        "llama3.2:3b",
        "mistral:7b",
        "aya:8b"
    ],
    "lmstudio": [
        "local-model",
        "qwen2.5-7b-instruct",
        "deepseek-r1-distill-qwen-7b",
        "llama-3.1-8b-instruct"
    ],
    "local": [
        "ضع ملفات .gguf أو مجلدات Hugging Face في مجلد models/"
    ]
}

async def fetch_provider_models(provider: str, api_key: str = "", base_url: str = "") -> List[Dict[str, str]]:
    """جلب قائمة النماذج المتاحة من مزود الذكاء الاصطناعي ديناميكياً بهيكلة {id, name}."""
    provider = provider.lower()

    if provider in ("local", "huggingface", "gguf"):
        try:
            from web_app.local_model_service import scan_local_models
            local_list = scan_local_models(custom_dir=base_url if base_url else None)
            if local_list:
                return local_list
        except Exception as e:
            print(f"Error scanning local models: {e}")
        return [
            {
                "id": "empty_models_folder",
                "name": "📁 مجلد models/ فارغ - ضع ملفات .gguf أو مجلدات Hugging Face فيه",
                "company": "local"
            }
        ]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if provider == "openai":
                if api_key:
                    res = await client.get(
                        "https://api.openai.com/v1/models",
                        headers={"Authorization": f"Bearer {api_key}"}
                    )
                    if res.status_code == 200:
                        data = res.json()
                        models = [
                            {"id": m["id"], "name": m["id"]}
                            for m in data.get("data", [])
                            if "gpt" in m["id"] or "o1" in m["id"]
                        ]
                        if models:
                            return sorted(models, key=lambda x: x["id"])

            elif provider == "openrouter":
                headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
                res = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers=headers
                )
                if res.status_code == 200:
                    data = res.json()
                    raw_models = data.get("data", [])
                    result = []
                    for m in raw_models:
                        mid = m.get("id")
                        if not mid:
                            continue
                        mname = m.get("name") or mid
                        company_slug = mid.split("/")[0].lower() if "/" in mid else "other"
                        context_len = m.get("context_length") or (m.get("top_provider") or {}).get("context_length")
                        result.append({
                            "id": mid,
                            "name": mname,
                            "company": company_slug,
                            "context_length": context_len
                        })

                    # فرز أبجدي لجميع النماذج حسب الشركة ثم اسم النموذج
                    result.sort(key=lambda x: (x.get("company", "").lower(), x.get("name", "").lower(), x.get("id", "").lower()))
                    if result:
                        return result

            elif provider == "google":
                if api_key:
                    res = await client.get(
                        f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                    )
                    if res.status_code == 200:
                        data = res.json()
                        models = [
                            {
                                "id": m["name"].replace("models/", ""),
                                "name": m.get("displayName", m["name"].replace("models/", ""))
                            }
                            for m in data.get("models", [])
                            if "gemini" in m["name"]
                        ]
                        if models:
                            return sorted(models, key=lambda x: x["id"])

            elif provider == "anthropic":
                if api_key:
                    res = await client.get(
                        "https://api.anthropic.com/v1/models",
                        headers={
                            "x-api-key": api_key,
                            "anthropic-version": "2023-06-01"
                        }
                    )
                    if res.status_code == 200:
                        data = res.json()
                        models = [
                            {
                                "id": m["id"],
                                "name": m.get("display_name", m["id"])
                            }
                            for m in data.get("data", [])
                        ]
                        if models:
                            return sorted(models, key=lambda x: x["id"])

            elif provider == "ollama":
                target_url = (base_url or "http://localhost:11434").rstrip("/")
                # محاولة جلب النماذج عبر /api/tags (الواجهة الأصلية لـ Ollama)
                try:
                    res = await client.get(f"{target_url}/api/tags", timeout=1.5)
                    if res.status_code == 200:
                        data = res.json()
                        models = []
                        for m in data.get("models", []):
                            m_name = m.get("name")
                            if m_name:
                                models.append({
                                    "id": m_name,
                                    "name": m_name,
                                    "company": "ollama"
                                })
                        if models:
                            return sorted(models, key=lambda x: x["id"])
                except Exception:
                    pass

                # محاولة ثانية عبر واجهة OpenAI المتوافقة /v1/models
                try:
                    res = await client.get(f"{target_url}/v1/models", timeout=1.5)
                    if res.status_code == 200:
                        data = res.json()
                        models = [
                            {"id": m["id"], "name": m["id"], "company": "ollama"}
                            for m in data.get("data", [])
                        ]
                        if models:
                            return sorted(models, key=lambda x: x["id"])
                except Exception:
                    pass

            elif provider == "lmstudio":
                target_url = (base_url or "http://192.168.100.134:1234").rstrip("/")
                endpoint = f"{target_url}/models" if target_url.endswith("/v1") else f"{target_url}/v1/models"
                try:
                    headers = {}
                    effective_token = (api_key or "").strip() or "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu"
                    headers["Authorization"] = f"Bearer {effective_token}"
                    res = await client.get(endpoint, headers=headers, timeout=6.0)
                    if res.status_code == 200:
                        data = res.json()
                        raw_data = data.get("data", [])
                        models = []
                        for m in raw_data:
                            mid = m.get("id")
                            if mid:
                                models.append({
                                    "id": mid,
                                    "name": m.get("name") or mid,
                                    "company": "lmstudio",
                                    "context_length": m.get("context_length", 32768)
                                })
                        if models:
                            return sorted(models, key=lambda x: x["id"])
                    else:
                        print(f"LM Studio API returned status {res.status_code} at {endpoint}: {res.text}")
                except Exception as e:
                    print(f"Error fetching models from LM Studio ({endpoint}): {e}")
    except Exception as e:
        print(f"Error fetching models for {provider}: {e}")

    curated = CURATED_MODELS.get(provider, [])
    return [{"id": m, "name": m, "company": provider} for m in curated]

def _extract_api_error(provider: str, status_code: int, text: str) -> str:
    """استخراج رسالة خطأ واضحة ومفهومة من استجابة المزود."""
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            # OpenRouter / OpenAI: {"error": {"message": "...", "code": ...}}
            err = data.get("error")
            if isinstance(err, dict):
                msg = err.get("message") or err.get("code") or json.dumps(err, ensure_ascii=False)
                return f"خطأ من مزود {provider} (رمز {status_code}): {msg}"
            elif isinstance(err, str):
                return f"خطأ من مزود {provider} (رمز {status_code}): {err}"
            if data.get("message"):
                return f"خطأ من مزود {provider} (رمز {status_code}): {data['message']}"
            if data.get("detail"):
                return f"خطأ من مزود {provider} (رمز {status_code}): {data['detail']}"
    except Exception:
        pass
    clean_text = text.strip()[:300] if text else "لا توجد تفاصيل إضافية"
    return f"خطأ من مزود {provider} (رمز {status_code}): {clean_text}"

async def call_ai_chat(
    provider: str,
    api_key: str = "",
    model: str = "",
    messages: List[Dict[str, str]] = None,
    system_prompt: str = "",
    temperature: float = 0.3,
    repetition_penalty: float = 0.0,
    max_tokens: int = 6000,
    structured_format: Optional[str] = None,
    base_url: Optional[str] = None,
    enforce_fiqh_template: bool = False
) -> Dict[str, Any]:
    """إرسال الاستعلام إلى النموذج المناسب بحسب المزود."""
    if messages is None:
        messages = []

    provider = (provider or "openrouter").lower().strip()

    if provider not in ("ollama", "lmstudio", "local", "huggingface", "gguf") and not api_key:
        raise ValueError(f"يرجى إدخال مفتاح API الخاص بـ {provider}")

    base_prompt = system_prompt.strip() if (system_prompt and system_prompt.strip()) else "أنت باحث شرعي ومحقق تراثي متخصص، تجيب بالاعتماد الصارم والدقيق على نصوص المكتبة الشاملة المرفقة بالسياق مع التوثيق الكامل (الكتاب، المؤلف، الجزء، الصفحة)."

    if structured_format and structured_format.strip():
        # في حال تفعيل الإخراج المهيكل، نلزم النموذج بإخراج JSON حصراً دون عناوين Markdown حتى لا يحدث خلط وتكرار
        effective_system = (
            f"{base_prompt}\n\n"
            "[تعليمات إلزامية للإخراج بهيكلة JSON المحددة فقط]:\n"
            "1. يجب أن تكون إجابتك كاملة ومستوفية ومفصلة لجميع جوانب المسألة.\n"
            "2. أخرج الرد حصراً ككائن JSON واحد صالح يبدأ بـ { وينتهي بـ }، دون أي نصوص أو مقدمات أو عناوين Markdown قبله أو بعده نهائياً.\n"
            "3. تنبيه حاسم: إياك فتح كود JSON جديد أو وضع كائن JSON كامل داخل حقل الترجيح أو تكرار المسألة داخله!\n"
            "4. التزم بدقة بهيكلة ومفاتيح الـ JSON التالية:\n"
            f"{structured_format.strip()}"
        )
    elif enforce_fiqh_template:
        # يُفعّل هذا القالب فقط إذا طُلب صراحة للتحقيق الفقهي العام، ولا يُفرض على النماذج المساعدة ذات التوجيه الخاص
        effective_system = (
            f"{base_prompt}\n\n"
            "[ضوابط علمية ومنهجية إلزامية للتحقيق الفقهي الكامل دون اختصار أو بتر]:\n"
            "1. يجب أن تكون إجابتك كاملة ومستوفية ومفصلة لجميع جوانب المسألة دون أي اختصار مخل.\n"
            "2. قسّم جوابك بدقة واكتب كل قسم تحت عنوان Markdown الصريح الآتي:\n"
            "   - ### صورة المسألة : (بيان حقيقة المسألة وتصويرها الواقعي بوضوح).\n"
            "   - ### تحرير محل النزاع : (تمييز موضع الاتفاق والإجماع من موضع الخلاف بين العلماء).\n"
            "   - ### سبب الخلاف : (العلة الأصولية أو الفقهية أو الحديثية التي نشأ منها الخلاف).\n"
            "   - ### الأقوال في المسألة : (عرض أقوال المذاهب الفقهية الأربعة مع نسبة كل قول لقائليه بدقة).\n"
            "   - ### الأدلة : (سرد أدلة كل مذهب من الكتاب والسنة والآثار ومناقشتها تفصيلاً من نصوص الشاملة المرفقة).\n"
            "   - ### الترجيح : (بيان القول الراجح مع ذكر وجه وعلة الترجيح وقوة الدليل والتعليل المقاصدي).\n"
            "   - ### الحاشية والتخريج : (عزو الآثار والأحاديث وتوثيق مواضع النقولات بدقة: الجزء والصفحة بأرقام (١)، (٢)...).\n"
            "   - ### المصادر والمراجع : (قائمة المصادر والمراجع التراثية المعتمدة كاملة دون حذف مرتبة حسب المذاهب أو هجائياً).\n"
            "3. تنبيه حاسم: إياك نهائياً وضع أي كود JSON أو أقواس { } أو إعادة صياغة المسألة كـ JSON في نهاية الجواب أو داخل قسم الترجيح! اكتب جواباً إنشائياً فقهياً خالصاً ومصاغاً بأسلوب التحقيق التراثي الرصين دون أي لغة برمجية.\n"
            "4. إياك والتوقف أو إنهاء الإجابة قبل كتابة قسمي (الترجيح) و(الحاشية والتخريج) و(المصادر والمراجع) كاملين؛ فالتحقيق لا يكتمل بدونهما."
        )
    else:
        # التزام تام بالموجّه المستلم دون أي زيادة أو فرض لقوالب أو عناوين عامة إطلاقاً
        effective_system = base_prompt

    if provider in ("ollama", "lmstudio"):
        client_timeout = httpx.Timeout(300.0, connect=30.0)
    else:
        client_timeout = httpx.Timeout(120.0, connect=15.0, read=120.0, write=30.0)

    async with httpx.AsyncClient(timeout=client_timeout) as client:
        # ضبط سقف رموز التوليد المخرجة بحسب حدود كل مزود لتفادي أخطاء 400
        provider_output_limits = {
            "openai": 16384,
            "anthropic": 8192,
            "google": 65536,
            "openrouter": 65536,
            "ollama": 131072,
            "lmstudio": 131072
        }
        safe_output_tokens = min(max_tokens, provider_output_limits.get(provider, 32768))

        # 1. المزود: OpenAI
        if provider == "openai":
            payload = {
                "model": model or "gpt-4o",
                "messages": [{"role": "system", "content": effective_system}] + messages,
                "temperature": temperature,
                "max_tokens": safe_output_tokens,
                "frequency_penalty": repetition_penalty
            }
            if structured_format and "{" in structured_format:
                payload["response_format"] = {"type": "json_object"}

            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload
            )
            if res.status_code != 200:
                raise Exception(_extract_api_error("OpenAI", res.status_code, res.text))
            data = res.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "usage": data.get("usage", {})
            }

        # 2. المزود: OpenRouter
        elif provider == "openrouter":
            # خريطة تحويل الأسماء القديمة/الملغاة تلقائياً لتفادي أخطاء 404
            OPENROUTER_MODEL_MAP = {
                "anthropic/claude-sonnet-4.5": "anthropic/claude-3.5-sonnet",
                "anthropic/claude-sonnet-4": "anthropic/claude-3.5-sonnet",
                "anthropic/claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
                "anthropic/claude-3-sonnet": "anthropic/claude-3.5-sonnet",
                "google/gemini-pro-1.5": "google/gemini-2.0-flash-001",
            }
            effective_model = OPENROUTER_MODEL_MAP.get(model, model) or "deepseek/deepseek-r1"

            payload = {
                "model": effective_model,
                "messages": [{"role": "system", "content": effective_system}] + messages,
                "temperature": temperature,
                "max_tokens": safe_output_tokens,
                "frequency_penalty": repetition_penalty
            }
            res = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": "http://localhost:8000",
                    "X-Title": "Shamela AI Search"
                },
                json=payload
            )
            if res.status_code != 200:
                err_text = res.text
                if "max_tokens" in err_text.lower() or "maximum allowable" in err_text.lower() or "tokens" in err_text.lower():
                    # إعادة المحاولة بسقف توليد آمن لتفادي أخطاء النماذج ذات سقف الإخراج المحدود
                    payload["max_tokens"] = 8192
                    res = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "HTTP-Referer": "http://localhost:8000",
                            "X-Title": "Shamela AI Search"
                        },
                        json=payload
                    )
            if res.status_code != 200:
                raise Exception(_extract_api_error("OpenRouter", res.status_code, res.text))
            data = res.json()
            choices = data.get("choices") or []
            if not choices:
                err_info = data.get("error")
                if err_info:
                    err_msg = err_info.get("message") if isinstance(err_info, dict) else str(err_info)
                    raise Exception(f"خطأ من مزود OpenRouter: {err_msg}")
                raise Exception(f"لم يُرجع مزود OpenRouter أي رد صالح في choices: {data}")
            choice = choices[0]
            choice_msg = choice.get("message", {})
            raw_content = choice_msg.get("content")
            if not raw_content:
                # دعم نماذج التفكير والاستدلال مثل DeepSeek-R1 عند إرجاع reasoning
                raw_content = choice_msg.get("reasoning") or choice_msg.get("reasoning_content") or ""
            finish_reason = choice.get("finish_reason")

            # إذا انقطع الرد لبلوغ سقف المخرجات (finish_reason == "length") نقوم باستكمال تلقائي ذكي لدمج بقية البحث
            if finish_reason == "length" and raw_content and len(raw_content.strip()) > 100:
                try:
                    cont_payload = dict(payload)
                    cont_payload["messages"] = list(payload["messages"]) + [
                        {"role": "assistant", "content": raw_content},
                        {"role": "user", "content": "أكمل الإجابة والبحث الفقهي بدقة من حيث توقفت تماماً دون تكرار أي كلام سابق، واستوفِ بقية الأقسام والترجيح وقائمة المراجع كاملة."}
                    ]
                    cont_res = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "HTTP-Referer": "http://localhost:8000",
                            "X-Title": "Shamela AI Search"
                        },
                        json=cont_payload
                    )
                    if cont_res.status_code == 200:
                        cont_data = cont_res.json()
                        cont_choices = cont_data.get("choices") or []
                        if cont_choices:
                            cont_text = cont_choices[0].get("message", {}).get("content") or ""
                            if cont_text:
                                raw_content = raw_content.rstrip() + "\n\n" + cont_text.strip()
                                finish_reason = cont_choices[0].get("finish_reason")
                except Exception as cont_err:
                    print(f"Auto-continuation error: {cont_err}")

            return {
                "content": raw_content or "",
                "usage": data.get("usage", {}),
                "finish_reason": finish_reason
            }

        # 3. المزود: Google Gemini (عبر الواجهة المتوافقة مع OpenAI)
        elif provider == "google":
            payload = {
                "model": model or "gemini-1.5-pro",
                "messages": [{"role": "system", "content": effective_system}] + messages,
                "temperature": temperature,
                "max_tokens": safe_output_tokens
            }
            if structured_format and "{" in structured_format:
                payload["response_format"] = {"type": "json_object"}

            res = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload
            )
            if res.status_code != 200:
                raise Exception(_extract_api_error("Google Gemini", res.status_code, res.text))
            data = res.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "usage": data.get("usage", {})
            }

        # 4. المزود: Anthropic Claude
        elif provider == "anthropic":
            # تنقية الرسائل لـ Claude
            claude_messages = []
            for m in messages:
                if m["role"] in ("user", "assistant"):
                    claude_messages.append({"role": m["role"], "content": m["content"]})

            payload = {
                "model": model or "claude-3-5-sonnet-20241022",
                "system": effective_system,
                "messages": claude_messages,
                "max_tokens": safe_output_tokens,
                "temperature": min(1.0, temperature)
            }

            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json=payload
            )
            if res.status_code != 200:
                raise Exception(_extract_api_error("Anthropic Claude", res.status_code, res.text))
            data = res.json()
            content_blocks = data.get("content", [])
            text = "".join(b.get("text", "") for b in content_blocks)
            return {
                "content": text,
                "usage": data.get("usage", {})
            }

        # 5. المزود: Ollama (نماذج محلية على جهازك)
        elif provider == "ollama":
            target_url = (base_url or "http://localhost:11434").rstrip("/")
            if target_url.endswith("/v1"):
                chat_url = f"{target_url}/chat/completions"
            else:
                chat_url = f"{target_url}/v1/chat/completions"

            payload = {
                "model": model or "qwen2.5:7b",
                "messages": [{"role": "system", "content": effective_system}] + messages,
                "temperature": temperature,
                "max_tokens": safe_output_tokens
            }
            if repetition_penalty > 0:
                payload["frequency_penalty"] = repetition_penalty
            if structured_format and "{" in structured_format:
                payload["response_format"] = {"type": "json_object"}

            try:
                res = await client.post(
                    chat_url,
                    headers={"Authorization": f"Bearer {api_key or 'ollama'}"},
                    json=payload
                )
            except httpx.ConnectError:
                raise Exception(
                    f"تعذر الاتصال بخادم Ollama المحلي على ({target_url}).\n"
                    "تأكد من تشغيل تطبيق Ollama أو تنفيذ الأمر `ollama serve` في شاشة الطرفية أولاً."
                )
            except httpx.TimeoutException:
                raise Exception(f"استغرق النموذج المحلي في Ollama وقتاً طويلاً لتوليد الرد. حاول تقليل طول السياق أو استخدام نموذج أخف حجماً.")

            if res.status_code != 200:
                raise Exception(_extract_api_error("Ollama", res.status_code, res.text))
            data = res.json()
            choices = data.get("choices") or []
            if not choices:
                raise Exception(f"لم يُرجع خادم Ollama أي ردود: {data}")
            msg = choices[0].get("message", {})
            content = msg.get("content") or msg.get("reasoning_content") or ""
            return {
                "content": content,
                "usage": data.get("usage", {})
            }

        # 6. المزود: LM Studio (نماذج محلية عبر خادم LM Studio)
        elif provider == "lmstudio":
            target_url = (base_url or "http://192.168.100.134:1234").rstrip("/")
            if target_url.endswith("/v1"):
                chat_url = f"{target_url}/chat/completions"
            else:
                chat_url = f"{target_url}/v1/chat/completions"

            payload = {
                "model": model or "local-model",
                "messages": [{"role": "system", "content": effective_system}] + messages,
                "temperature": temperature,
                "max_tokens": safe_output_tokens
            }
            if repetition_penalty > 0:
                payload["frequency_penalty"] = repetition_penalty
            if structured_format and "{" in structured_format:
                payload["response_format"] = {"type": "json_object"}

            effective_token = (api_key or "").strip() or "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu"
            try:
                res = await client.post(
                    chat_url,
                    headers={"Authorization": f"Bearer {effective_token}"},
                    json=payload
                )
            except httpx.ConnectError:
                raise Exception(
                    f"تعذر الاتصال بخادم LM Studio المحلي على ({target_url}).\n"
                    "تأكد من تشغيل تطبيق LM Studio وتفعيل الـ Local Server من تبويب المطور (Developer)."
                )
            except httpx.TimeoutException:
                raise Exception(f"استغرق النموذج في LM Studio وقتاً طويلاً لتوليد الرد. حاول تقليل السياق أو استخدام نموذج أصغر.")

            if res.status_code != 200:
                raise Exception(_extract_api_error("LM Studio", res.status_code, res.text))
            data = res.json()
            choices = data.get("choices") or []
            if not choices:
                raise Exception(f"لم يُرجع خادم LM Studio أي ردود: {data}")
            msg = choices[0].get("message", {})
            content = msg.get("content") or msg.get("reasoning_content") or ""
            return {
                "content": content,
                "usage": data.get("usage", {})
            }

        # 7. المزود: Local (تشغيل نماذج Hugging Face و GGUF من مجلد models/ محلياً بدون وسيط)
        elif provider in ("local", "huggingface", "gguf"):
            try:
                from web_app.local_model_service import generate_local_response_stream
                chunks = []
                async for chunk in generate_local_response_stream(
                    model_name=model,
                    messages=messages,
                    system_prompt=effective_system,
                    temperature=temperature,
                    max_tokens=safe_output_tokens
                ):
                    chunks.append(chunk)
                full_response = "".join(chunks)
                return {
                    "content": full_response,
                    "usage": {"total_tokens": len(full_response) // 4}
                }
            except Exception as e:
                raise Exception(f"خطأ أثناء تشغيل النموذج المحلي ({model}): {str(e)}")

        else:
            raise ValueError(f"مزود غير مدعوم: {provider}")

async def reformulate_fiqh_query(
    provider: str,
    api_key: str,
    model: str,
    user_query: str,
    system_prompt: str = "",
    base_url: Optional[str] = None
) -> str:
    """إعادة صياغة وتعديل سؤال المستخدم إلى استعلام فقهي تراثي مركز وفق التوجيه المطلوب لإرساله لمحرك البحث."""
    if not user_query or not user_query.strip():
        return user_query

    prompt_content = (
        "أنت باحث متخصص في فقه التراث والمكتبة الشاملة ومصطلحات كتب المذاهب والحديث النبوي.\n"
        "المطلوب: أعد صياغة وتحويل مسألة وسؤال الباحث الآتي إلى عبارة واستعلام بحث فقهي تراثي مركز يحتوي على أدق الألفاظ الاصطلاحية وأبواب الفقه، وألفاظ الأحاديث والآثار ذات الصلة المباشرة، لكي يُرسل إلى محرك بحث الشاملة (Qdrant) لجلب أدق النصوص ذات الصلة.\n"
    )
    if system_prompt and system_prompt.strip():
        prompt_content += f"\n[التوجيه والضوابط المعتمدة في التحقيق]:\n{system_prompt.strip()}\n"

    prompt_content += (
        f"\n[سؤال الباحث]:\n{user_query.strip()}\n\n"
        "تعليمات حاسمة: أخرج حصراً عبارة البحث التراثية المركزة في سطر واحد فقط دون أي مقدمات أو شروح أو علامات تنصيص نهائياً."
    )

    try:
        res = await asyncio.wait_for(
            call_ai_chat(
                provider=provider,
                api_key=api_key,
                model=model,
                messages=[{"role": "user", "content": prompt_content}],
                system_prompt="أنت خبير محرك بحث التراث الإسلامي وصياغة الاستعلامات الفقهية الدقيقة.",
                temperature=0.2,
                max_tokens=150,
                base_url=base_url
            ),
            timeout=10.0
        )
        reformulated = res.get("content", "").strip()
        reformulated = re.sub(r"[\"\'\`]", "", reformulated).strip()
        lines = [l.strip() for l in reformulated.split("\n") if l.strip()]
        if lines:
            clean_q = lines[0]
            if len(clean_q) > 3:
                return clean_q
    except Exception as e:
        print(f"Notice: Query reformulation skipped/timed out: {e}")

    return user_query

async def plan_supplementary_searches(
    provider: str,
    api_key: str,
    model: str,
    user_query: str,
    sources: List[Dict[str, Any]],
    system_prompt: str = "",
    base_url: Optional[str] = None
) -> Dict[str, Any]:
    """فحص كفاية النصوص المسترجعة وتحديد النواقص وتوليد استعلامات بحث تكميلي لتخريج الأحاديث أو استكمال المذاهب الناقصة."""
    if not sources:
        return {"needs_more": False, "reason": "لا توجد نصوص أولية", "queries": []}

    brief_lines = []
    for i, s in enumerate(sources):
        t = (s.get("title_ar") or "كتاب في الشاملة").strip()
        a = (s.get("author_name") or "").strip()
        p = str(s.get("part") or "").strip()
        pg = str(s.get("page_num") or "").strip()
        body_text = (s.get("full_body") or s.get("snippet") or "").strip()
        fn = (s.get("footnotes") or "").strip()

        line_entry = f"[{i+1}] كتاب: {t}"
        if a: line_entry += f" (المؤلف: {a})"
        if p or pg: line_entry += f" [جـ {p} صـ {pg}]"
        line_entry += f":\n«{body_text}»"
        if fn:
            line_entry += f"\n[الحاشية والتخريج]: {fn}"
        brief_lines.append(line_entry)

    sources_summary = "\n---\n".join(brief_lines)

    eval_prompt = (
        "أنت محقق وباحث فقهي ناقد ومدقق.\n"
        f"المسألة الفقهية المطلوبة: {user_query}\n\n"
        f"النصوص التراثية المتاحة في البحث حتى الآن:\n{sources_summary}\n\n"
        "المطلوب: افحص بدقة وعناية كاملة ما إذا كان هناك نقص أو عجز في البيانات يحتاج لبحث تكميلي لسدّه، مثل:\n"
        "1. غياب رأي مذهب من المذاهب الفقهية الأربعة أو عدم وضوح دليله في النصوص المسترجعة.\n"
        "2. وجود أحاديث أو آثار مذكورة تحتاج إلى تخريج وتحقق من ألفاظها أو صحتها وأسانيدها من كتب السنة والحديث.\n"
        "3. غموض في علة الخلاف أو وجه الاستدلال يحتاج لنصوص تحقيق إضافية.\n\n"
        "إذا كانت النصوص المتوفرة كافية ومستوفية لتحرير المسألة، أخرج JSON بالصيغة:\n"
        '{"needs_more": false, "reason": "النصوص الحالية كافية ومستوفية لتحرير المسألة"}\n\n'
        "إذا كان هناك نقص وعجز في البيانات، حدد ما يصل إلى استعلامين بحثيين تكميليين مركزين بألفاظ تراثية دقيقة:\n"
        '{"needs_more": true, "reason": "بيان سبب النقص وما يراد تخريجه والتحقق منه", "queries": ["عبارة بحث تكميلي 1", "عبارة بحث تكميلي 2"]}\n\n'
        "تنبيه: أخرج حصراً كائن JSON صالح يبدأ بـ { وينتهي بـ } دون أي كلام قبله أو بعده."
    )

    try:
        res = await asyncio.wait_for(
            call_ai_chat(
                provider=provider,
                api_key=api_key,
                model=model,
                messages=[{"role": "user", "content": eval_prompt}],
                system_prompt="أنت مدقق علمي خبير، تخرج إجاباتك بتنسيق JSON حصراً.",
                temperature=0.2,
                max_tokens=800,
                structured_format='{"needs_more": false, "reason": "...", "queries": []}'
            ),
            timeout=12.0
        )
        content = res.get("content", "").strip()
        if "```" in content:
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
        content = content.strip()
        m = re.search(r"(\{[\s\S]*\})", content)
        if m:
            data = json.loads(m.group(1))
            if isinstance(data, dict):
                queries = data.get("queries") or []
                if isinstance(queries, str):
                    queries = [queries]
                return {
                    "needs_more": bool(data.get("needs_more")),
                    "reason": str(data.get("reason", "")),
                    "queries": [q.strip() for q in queries if isinstance(q, str) and q.strip()]
                }
    except Exception as e:
        print(f"Notice: Supplementary research skipped/timed out: {e}")

    return {"needs_more": False, "reason": "النصوص الحالية كافية", "queries": []}

def generate_word_report(title: str, query: str, answer: str, sources: List[Dict[str, Any]]) -> io.BytesIO:
    """توليد ملف Word (.docx) منسق باحترافية وتوثيق أكاديمي باللغة العربية."""
    doc = Document()
    
    # ضبط الاتجاه العام
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    # العنوان الرئيسي
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_title = title_p.add_run("المكتبة الشاملة — تقرير البحث والتحقيق الذكي")
    run_title.font.name = "Traditional Arabic"
    run_title.font.size = Pt(22)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(5, 150, 105)

    # مسألة البحث
    query_p = doc.add_paragraph()
    query_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_q_label = query_p.add_run("المسألة / الاستفسار: ")
    r_q_label.font.name = "Traditional Arabic"
    r_q_label.font.size = Pt(16)
    r_q_label.font.bold = True
    r_q_label.font.color.rgb = RGBColor(30, 41, 59)
    
    r_q_val = query_p.add_run(query)
    r_q_val.font.name = "Traditional Arabic"
    r_q_val.font.size = Pt(16)
    r_q_val.font.italic = True

    doc.add_paragraph("—" * 45).alignment = WD_ALIGN_PARAGRAPH.CENTER

    # عنوان الإجابة والتحقيق
    h_ans = doc.add_paragraph()
    h_ans.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_h_ans = h_ans.add_run("خلاصة التحقيق والبيان:")
    r_h_ans.font.name = "Traditional Arabic"
    r_h_ans.font.size = Pt(18)
    r_h_ans.font.bold = True
    r_h_ans.font.color.rgb = RGBColor(16, 185, 129)

    # متن الإجابة
    for line in answer.split("\n"):
        line_clean = line.strip()
        if not line_clean:
            continue
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r = p.add_run(line_clean)
        r.font.name = "Traditional Arabic"
        r.font.size = Pt(15)

    # قسم المصادر التراثية المعتمدة
    if sources:
        doc.add_page_break()
        h_src = doc.add_paragraph()
        h_src.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_h_src = h_src.add_run("المصادر والنصوص التراثية المعتمدة من الشاملة:")
        r_h_src.font.name = "Traditional Arabic"
        r_h_src.font.size = Pt(18)
        r_h_src.font.bold = True
        r_h_src.font.color.rgb = RGBColor(180, 83, 9)

        for i, s in enumerate(sources):
            src_p = doc.add_paragraph()
            src_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            
            # رأس المصدر
            title_text = s.get("title_ar", "")
            author_text = s.get("author_name", "")
            part = s.get("part", "")
            page = s.get("page_num", "")
            
            cit = f"[{i+1}] {title_text}"
            if author_text:
                cit += f" — تأليف: {author_text}"
            if part:
                cit += f" (جـ {part})"
            if page:
                cit += f" (صـ {page})"

            r_src_head = src_p.add_run(cit + "\n")
            r_src_head.font.name = "Traditional Arabic"
            r_src_head.font.size = Pt(14)
            r_src_head.font.bold = True
            r_src_head.font.color.rgb = RGBColor(30, 41, 59)

            # نص الشاهد
            body_text = s.get("full_body") or s.get("snippet") or ""
            if body_text:
                r_body = src_p.add_run(f"«{body_text[:500]}...»\n")
                r_body.font.name = "Traditional Arabic"
                r_body.font.size = Pt(13)
                r_body.font.italic = True
                
            # الحاشية إن وجدت
            fn = s.get("footnotes")
            if fn:
                r_fn = src_p.add_run(f"الحاشية: {fn[:300]}\n")
                r_fn.font.name = "Traditional Arabic"
                r_fn.font.size = Pt(11)
                r_fn.font.color.rgb = RGBColor(100, 116, 139)

            doc.add_paragraph("· · · · ·").alignment = WD_ALIGN_PARAGRAPH.CENTER

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer

def extract_fiqh_sections(answer_text: str) -> Dict[str, str]:
    """استخراج الأقسام والمسائل الفقهية سواء كانت بنسق JSON أو بنسق Markdown/نص منسق، مع تنقية الترجيح من أي كود برمجي."""
    sections: Dict[str, str] = {}
    if not answer_text:
        return sections

    trimmed = answer_text.strip()
    # تنظيف كود markdown blocks إن وجد
    if trimmed.startswith("```"):
        lines = trimmed.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        trimmed = "\n".join(lines).strip()

    # 1. فحص ما إذا كان الرد بأكمله بتنسيق JSON مهيكل
    parsed_json_dict = None
    try:
        j = json.loads(trimmed)
        if isinstance(j, dict):
            parsed_json_dict = j
    except Exception:
        pass

    # 1.2 فحص ما إذا كان هناك كائن JSON مدمج داخل النص (مثلما يحصل إذا وضع النموذج الـ JSON في نهاية النص أو داخل الترجيح)
    if not parsed_json_dict:
        json_matches = list(re.finditer(r"(\{[\s\S]*\})", trimmed))
        if json_matches:
            for match in reversed(json_matches):
                candidate = match.group(1).strip()
                try:
                    j = json.loads(candidate)
                    if isinstance(j, dict) and any(k in j for k in ["عنوان_المسألة", "عنوان المسألة", "المسألة", "صورة_المسألة", "صورة المسألة", "القول_الراجح", "الترجيح", "أقوال_العلماء"]):
                        parsed_json_dict = j
                        break
                except Exception:
                    pass

    if parsed_json_dict:
        for k, v in parsed_json_dict.items():
            val_str = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, indent=2)
            sections[k] = val_str
            norm = k.replace(" ", "_").strip()
            sections[norm] = val_str
            sections[norm.replace("_", " ")] = val_str

            # ربط الحواشي والتخريج بكافة المسميات
            if any(fn_k in k for fn_k in ["حاشي", "هامش", "هوامش", "تخريج", "footnote", "notes"]):
                sections["الحاشية"] = val_str
                sections["الحواشي"] = val_str
                sections["حاشية"] = val_str
                sections["حواشي"] = val_str
                sections["الهامش"] = val_str
                sections["الهوامش"] = val_str
                sections["التخريج"] = val_str
                sections["footnote"] = val_str
                sections["footnotes"] = val_str

            # ربط المصادر والمراجع بكافة المسميات
            if any(ref_k in k for ref_k in ["مراجع", "مصادر", "reference", "bibliography"]):
                sections["المراجع"] = val_str
                sections["المصادر"] = val_str
                sections["المصادر والمراجع"] = val_str
                sections["المصادر_والمراجع"] = val_str

        # استخراج الترجيح الصافي من الـ JSON إن وجد
        real_tarjih = parsed_json_dict.get("القول_الراجح") or parsed_json_dict.get("الترجيح") or parsed_json_dict.get("الراجح") or parsed_json_dict.get("الخلاصة")
        if real_tarjih:
            tarjih_str = real_tarjih if isinstance(real_tarjih, str) else json.dumps(real_tarjih, ensure_ascii=False, indent=2)
            sections["الترجيح"] = tarjih_str
            sections["القول_الراجح"] = tarjih_str
            sections["القول الراجح"] = tarjih_str

    # 2. استخراج الأقسام من نصوص Markdown والعناوين الفقهية الصريحة
    section_patterns = [
        ("صورة_المسألة", [
            r"(?:^|\n)\s*(?:#{1,6}\s*|\*{1,2}\s*|\d+[\.\-]\s*|\b)(?:صورة\s+المسألة|تصوير\s+المسألة|حقيقة\s+المسألة|صورة\s+المساله)[\s\:\*\#\-]*"
        ]),
        ("تحرير_محل_النزاع", [
            r"(?:^|\n)\s*(?:#{1,6}\s*|\*{1,2}\s*|\d+[\.\-]\s*|\b)(?:تحرير\s+محل\s+النزاع|محل\s+النزاع|تحرير\s+الخلاف|محل\s+الاتفاق\s+والافتراق)[\s\:\*\#\-]*"
        ]),
        ("سبب_الخلاف", [
            r"(?:^|\n)\s*(?:#{1,6}\s*|\*{1,2}\s*|\d+[\.\-]\s*|\b)(?:سبب\s+الخلاف|منشأ\s+الخلاف|علة\s+الخلاف|مأخذ\s+الخلاف)[\s\:\*\#\-]*"
        ]),
        ("الأقوال_في_المسألة", [
            r"(?:^|\n)\s*(?:#{1,6}\s*|\*{1,2}\s*|\d+[\.\-]\s*|\b)(?:الأقوال\s+في\s+المسألة|أقوال\s+العلماء|أقوال\s+المذاهب|مذاهب\s+العلماء|عرض\s+الأقوال|الأقوال)[\s\:\*\#\-]*"
        ]),
        ("الأدلة", [
            r"(?:^|\n)\s*(?:#{1,6}\s*|\*{1,2}\s*|\d+[\.\-]\s*|\b)(?:الأدلة\s+ومناقشتها|أدلة\s+الأقوال|أدلة\s+المذاهب|الأدلة|مناقشة\s+الأدلة|أدلة\s+كل\s+قول)[\s\:\*\#\-]*"
        ]),
        ("الترجيح", [
            r"(?:^|\n)\s*(?:#{1,6}\s*|\*{1,2}\s*|\d+[\.\-]\s*|\b)(?:الترجيح\s+المستند\s+للدليل|الترجيح\s+وعلته|القول\s+الراجح|الترجيح|الرأي\s+الراجح|وجه\s+الترجيح|الخلاصة\s+والترجيح|الراجح)[\s\:\*\#\-]*"
        ]),
        ("الحواشي", [
            r"(?:^|\n)\s*(?:#{1,6}\s*|\*{1,2}\s*|\d+[\.\-]\s*|\b)(?:الحواشي\s+والمراجع|الحاشية\s+والمراجع|الحواشي\s+والتخريج|الحاشية\s+والتخريج|الهوامش\s+والمراجع|الهامش\s+والمراجع|الهوامش\s+والتخريج|الهامش\s+والتخريج|الحواشي|الحاشية|حواشي|حاشية|الهوامش|الهامش|هوامش|هامش|التخريج\s+والحواشي|التخريج\s+والحاشية|التخريج|تخريج\s+الآثار|تخريج\s+الأحاديث|تخريج)[\s\:\*\#\-]*"
        ]),
        ("المراجع", [
            r"(?:^|\n)\s*(?:#{1,6}\s*|\*{1,2}\s*|\d+[\.\-]\s*|\b)(?:المصادر\s+والمراجع|المصادر\s+والمراجع\s+المعتمدة|قائمة\s+المصادر\s+والمراجع|ثبت\s+المصادر\s+والمراجع|ثبت\s+المراجع|المراجع\s+والمصادر|المراجع|المصادر)[\s\:\*\#\-]*"
        ]),
    ]

    matches = []
    for sec_key, pats in section_patterns:
        for pat in pats:
            for m in re.finditer(pat, answer_text, re.IGNORECASE):
                matches.append((m.start(), m.end(), sec_key))

    matches.sort(key=lambda x: x[0])

    for i, (m_start, m_end, sec_key) in enumerate(matches):
        next_start = matches[i + 1][0] if i + 1 < len(matches) else len(answer_text)
        content = answer_text[m_end:next_start].strip()
        content = re.sub(r"^[\:\*\#\-\s]+", "", content).strip()
        if content:
            # إذا لم يكن القسم معبأً مسبقاً من الـ JSON، أو إذا كان نصاً جديداً
            if sec_key not in sections or not sections[sec_key]:
                sections[sec_key] = content
                sections[sec_key.replace("_", " ")] = content
                if sec_key == "الحواشي":
                    sections["الحاشية"] = content
                    sections["حاشية"] = content
                    sections["حواشي"] = content
                    sections["الهامش"] = content
                    sections["الهوامش"] = content
                    sections["التخريج"] = content
                    sections["footnote"] = content
                    sections["footnotes"] = content

    # 3. استخراج بديل ذكي للحواشي في حال ورودها كأرقام مرقمة في نهاية النص أو بعد الترجيح
    if not (sections.get("الحواشي") or sections.get("الحاشية")):
        tarjih_candidate = sections.get("الترجيح") or ""
        search_target = tarjih_candidate if tarjih_candidate else answer_text
        fn_match = re.search(
            r"(?:\n|^)\s*((?:(?:\([0-9\u0660-\u0669\u06f0-\u06f9]+\)|\[[0-9\u0660-\u0669\u06f0-\u06f9]+\]|[0-9\u0660-\u0669\u06f0-\u06f9]+[\.\-])\s*.+(?:\n|$))+)",
            search_target
        )
        if fn_match:
            fn_block = fn_match.group(1).strip()
            if fn_block:
                sections["الحواشي"] = fn_block
                sections["الحاشية"] = fn_block
                sections["حاشية"] = fn_block
                sections["حواشي"] = fn_block
                sections["الهامش"] = fn_block
                sections["الهوامش"] = fn_block
                sections["التخريج"] = fn_block
                sections["footnote"] = fn_block
                sections["footnotes"] = fn_block
                # تنظيف الترجيح من كتلة الحواشي إذا كانت مستخرجة من داخله
                if tarjih_candidate and fn_match.start() > 0:
                    cleaned_t = tarjih_candidate[:fn_match.start()].strip()
                    if cleaned_t:
                        sections["الترجيح"] = cleaned_t
                        sections["القول_الراجح"] = cleaned_t
                        sections["القول الراجح"] = cleaned_t

    # 4. تنقية حقل الترجيح بشكل حاسم إذا كان يحتوي على كود JSON بداخله
    tarjih_val = sections.get("الترجيح") or sections.get("القول_الراجح") or ""
    if tarjih_val and "{" in tarjih_val and "}" in tarjih_val:
        m = re.search(r"(\{[\s\S]*\})", tarjih_val)
        if m:
            try:
                inner_j = json.loads(m.group(1))
                if isinstance(inner_j, dict):
                    # دمج حقول المسألة المستخرجة التي قد تكون ناقصة
                    for k, v in inner_j.items():
                        if k not in sections or not sections[k]:
                            val_str = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, indent=2)
                            sections[k] = val_str
                            sections[k.replace(" ", "_")] = val_str
                    # استخلاص النص الحقيقي الصافي للترجيح
                    clean_t = inner_j.get("القول_الراجح") or inner_j.get("الترجيح") or inner_j.get("الراجح") or inner_j.get("الخلاصة")
                    text_before = tarjih_val[:m.start()].strip()
                    text_before = re.sub(r"^(?:الراجح|الترجيح|القول الراجح)[\s\:\*\-]*", "", text_before).strip()
                    if clean_t:
                        sections["الترجيح"] = clean_t if not text_before else f"{text_before}\n\n{clean_t}"
                        sections["القول_الراجح"] = sections["الترجيح"]
                    elif text_before:
                        sections["الترجيح"] = text_before
                        sections["القول_الراجح"] = text_before
            except Exception:
                pass

    return sections

def populate_custom_craft_schema(schema: Any, context: Dict[str, Any]) -> Any:
    """
    يقوم بملء هيكلة الـ JSON المخصصة المنسوخة من تبويب Data في CraftMyPDF
    بقيم البحث الفقهي المستخرجة، مع الحفاظ التام على بنية ومفاتيح القالب.
    """
    if isinstance(schema, dict):
        result = {}
        for k, v in schema.items():
            k_lower = str(k).strip().lower()
            # 1. فحص التطابق المباشر في السياق
            matched_val = None
            if k in context:
                matched_val = context[k]
            else:
                # 2. محاولة المطابقة بالمرادفات والتطابق اللفظي
                k_clean = k_lower.replace("_", "").replace(" ", "").replace("-", "")
                for ctx_k, ctx_v in context.items():
                    ctx_k_clean = str(ctx_k).strip().lower().replace("_", "").replace(" ", "").replace("-", "")
                    if k_clean == ctx_k_clean:
                        matched_val = ctx_v
                        break

            if isinstance(v, dict):
                result[k] = populate_custom_craft_schema(v, context)
            elif isinstance(v, list):
                # إذا كانت مصفوفة كائنات، ننظر هل المفتاح يشير إلى مراجع أو حواشي
                if any(ref_word in k_lower for ref_word in ["source", "ref", "item", "book", "مراجع", "مصادر"]):
                    items_source = context.get("sources") or context.get("items") or []
                    if v and isinstance(v[0], dict):
                        row_tpl = v[0]
                        result[k] = [populate_custom_craft_schema(row_tpl, {**context, **item}) for item in items_source]
                    else:
                        result[k] = items_source
                elif any(fn_word in k_lower for fn_word in ["footnote", "note", "hashi", "حاشي", "هامش"]):
                    fn_source = context.get("footnotes_list") or []
                    if v and isinstance(v[0], dict):
                        row_tpl = v[0]
                        result[k] = [populate_custom_craft_schema(row_tpl, {**context, **fn}) for fn in fn_source]
                    else:
                        result[k] = fn_source
                else:
                    result[k] = [populate_custom_craft_schema(elem, context) for elem in v]
            else:
                if matched_val is not None and matched_val != "":
                    result[k] = matched_val
                elif v not in (None, "", "string", "text", "str"):
                    result[k] = v
                elif matched_val is not None:
                    result[k] = matched_val
                else:
                    result[k] = ""
        return result
    elif isinstance(schema, list):
        return [populate_custom_craft_schema(elem, context) for elem in schema]
    else:
        return schema

async def export_to_craftmypdf(
    api_key: str,
    template_id: str,
    title: str,
    query: str,
    answer: str,
    sources: List[Dict[str, Any]],
    custom_data_schema: Optional[Union[Dict[str, Any], str]] = None
) -> Dict[str, Any]:
    """تصدير البحث والنتائج الفقهية إلى PDF احترافي عبر CraftMyPDF ببيانات غير مقتطعة ومطابقة لكافة الحقول."""
    if not api_key:
        raise ValueError("يرجى إدخال مفتاح API الخاص بـ CraftMyPDF")
    if not template_id:
        raise ValueError("يرجى إدخال معرف القالب Template ID الخاص بـ CraftMyPDF")

    # استخراج الأقسام الفقهية من الجواب
    sections = extract_fiqh_sections(answer)

    surat = sections.get("صورة_المسألة") or sections.get("صورة المسألة") or ""
    tahrir = sections.get("تحرير_محل_النزاع") or sections.get("تحرير محل النزاع") or ""
    sabab = sections.get("سبب_الخلاف") or sections.get("سبب الخلاف") or ""
    aqwal = sections.get("الأقوال_في_المسألة") or sections.get("أقوال_العلماء") or sections.get("الأقوال") or ""
    adillah = sections.get("الأدلة") or sections.get("أدلة") or ""
    tarjih = sections.get("الترجيح") or sections.get("القول_الراجح") or sections.get("القول الراجح") or ""

    # استخراج ذكي للترجيح في حال عدم وجود عنوان مستقل
    if not tarjih:
        paragraphs = [p.strip() for p in answer.split("\n\n") if p.strip()]
        for p in reversed(paragraphs):
            if any(kw in p for kw in ["يترجح", "الراجح", "والأظهر", "الأظهر", "والأقرب", "المختار", "والصحيح", "والحاصل", "وخلاصة"]):
                tarjih = p
                break
        if not tarjih and paragraphs:
            tarjih = paragraphs[-1]

    # إذا لم تكن هناك عناوين مقسمة، نملأ الحقول بمحتوى الجواب حتى لا تظهر undefined
    if not (surat or tahrir or sabab or aqwal or adillah):
        surat = answer
        aqwal = answer
        adillah = "مفصلة وموثقة ضمن سياق نصوص الشاملة المرفقة في البحث."

    # صياغة الحواشي والتخريج والمراجع حصراً من إجابة النموذج وتنسيقه دون تضمين نصوص الشاملة الخام
    # استخراج الحواشي والتخريج بأي مسمى محتمل (مفرد أو جمع) من إجابة النموذج
    raw_footnotes = (
        sections.get("الحاشية") or
        sections.get("الحواشي") or
        sections.get("حاشية") or
        sections.get("حواشي") or
        sections.get("الهامش") or
        sections.get("هامش") or
        sections.get("الهوامش") or
        sections.get("هوامش") or
        sections.get("التخريج") or
        sections.get("تخريج") or
        sections.get("تخريج_الآثار") or
        sections.get("الحاشية والتخريج") or
        sections.get("الحواشي والتخريج") or
        sections.get("footnote") or
        sections.get("footnotes") or
        sections.get("footnotes_text") or
        sections.get("hashiah") or
        sections.get("alhashia") or
        ""
    ).strip()

    formatted_footnotes_text = raw_footnotes

    # صياغة مصفوفة الحواشي ككائنات لدعم قوالب CraftMyPDF التكرارية (Repeaters / Tables) من إجابة النموذج فقط
    footnotes_list = []
    if formatted_footnotes_text:
        for idx, line in enumerate(formatted_footnotes_text.split("\n")):
            line_clean = line.strip()
            if line_clean:
                num_m = re.match(r"^\s*(?:[\(\[]?([0-9\u0660-\u0669\u06f0-\u06f9]+)[\)\]\.\-\:]?)\s*(.+)$", line_clean)
                if num_m:
                    num_val = num_m.group(1)
                    body_val = num_m.group(2).strip()
                else:
                    num_val = str(len(footnotes_list) + 1)
                    body_val = line_clean
                footnotes_list.append({
                    "index": len(footnotes_list) + 1,
                    "num": num_val,
                    "id": num_val,
                    "text": line_clean,
                    "content": body_val,
                    "note": body_val,
                    "citation": line_clean
                })

    # استخراج المراجع والمصادر حصراً من إجابة النموذج دون تضمين نصوص الشاملة الخام
    raw_references = (
        sections.get("المراجع") or
        sections.get("المصادر") or
        sections.get("المصادر_والمراجع") or
        sections.get("المصادر والمراجع") or
        sections.get("قائمة_المراجع") or
        sections.get("references") or
        ""
    ).strip()

    formatted_references_text = raw_references

    # صياغة مصفوفة المراجع ككائنات لقوالب CraftMyPDF التكرارية من إجابة النموذج فقط
    references_list = []
    if formatted_references_text:
        for idx, line in enumerate(formatted_references_text.split("\n")):
            line_clean = line.strip()
            if line_clean:
                num_m = re.match(r"^\s*(?:[\(\[]?([0-9\u0660-\u0669\u06f0-\u06f9]+)[\)\]\.\-\:]?)\s*(.+)$", line_clean)
                if num_m:
                    num_val = num_m.group(1)
                    body_val = num_m.group(2).strip()
                else:
                    num_val = str(len(references_list) + 1)
                    body_val = line_clean
                references_list.append({
                    "index": len(references_list) + 1,
                    "num": num_val,
                    "id": num_val,
                    "no": num_val,
                    "title": body_val,
                    "book_title": body_val,
                    "book": body_val,
                    "book_name": body_val,
                    "name": body_val,
                    "author": "",
                    "author_name": "",
                    "citation": line_clean,
                    "text": line_clean
                })

    formatted_sources = references_list

    title_val = title or sections.get("المسألة") or query or "مسائل فقهية مقارنة بواسطة الذكاء الاصطناعي"

    # صياغة البيانات المتوافقة مع قوالب CraftMyPDF بكل الاحتمالات والمسميات
    payload_data: Dict[str, Any] = {
        # عنوان المسألة والبحث
        "title": title_val,
        "المسألة": title_val,
        "مسألة": title_val,
        "عنوان_المسألة": title_val,
        "عنوان المسألة": title_val,
        "masala": title_val,
        "query": query,
        "question": query,
        "prompt": query,
        "topic": title_val,
        "subject": title_val,
        "heading": title_val,
        "header": title_val,
        "name": title_val,

        # صورة المسألة
        "صورة_المسألة": surat,
        "صورة المسألة": surat,
        "صورةالمسألة": surat,
        "صورت_المسألة": surat,
        "صورت_المساله": surat,
        "صورة_المساله": surat,
        "surat_almasala": surat,
        "surah": surat,
        "soura": surat,
        "case_description": surat,
        "issue_case": surat,

        # تحرير محل النزاع
        "تحرير_محل_النزاع": tahrir,
        "تحرير محل النزاع": tahrir,
        "تحريرمحل_النزاع": tahrir,
        "محل_النزاع": tahrir,
        "محل النزاع": tahrir,
        "tahrir_mahall_alniza": tahrir,
        "tahrir": tahrir,
        "dispute": tahrir,

        # سبب الخلاف
        "سبب_الخلاف": sabab,
        "سبب الخلاف": sabab,
        "سبب_خلاف": sabab,
        "منشأ_الخلاف": sabab,
        "علة_الخلاف": sabab,
        "sabab_alkhilaf": sabab,
        "sabab": sabab,
        "reason": sabab,

        # الأقوال في المسألة
        "الأقوال_في_المسألة": aqwal,
        "الأقوال في المسألة": aqwal,
        "أقوال_العلماء": aqwal,
        "أقوال العلماء": aqwal,
        "أقوال_المذاهب": aqwal,
        "الأقوال": aqwal,
        "الاقوال": aqwal,
        "اقوال": aqwal,
        "alaqwal": aqwal,
        "aqwal": aqwal,
        "opinions": aqwal,
        "views": aqwal,
        "scholars": aqwal,

        # الأدلة
        "الأدلة": adillah,
        "الادلة": adillah,
        "أدلة": adillah,
        "ادلة": adillah,
        "أدلة_الأقوال": adillah,
        "أدلة الأقوال": adillah,
        "أدلة_المسألة": adillah,
        "adillah": adillah,
        "dalil": adillah,
        "evidences": adillah,
        "proofs": adillah,

        # الترجيح والخاتمة
        "الترجيح": tarjih,
        "القول_الراجح": tarjih,
        "القول الراجح": tarjih,
        "الراجح": tarjih,
        "الخلاصة": tarjih or sections.get("الخلاصة") or "",
        "الخلاصة_العلمية": tarjih or sections.get("الخلاصة") or "",
        "الخاتمة": tarjih,
        "tarjih": tarjih,
        "preferred": tarjih,
        "conclusion": tarjih,

        # المراجع والمصادر (نص كامل ومفصل)
        "المراجع": formatted_references_text,
        "مراجع": formatted_references_text,
        "قائمة_المراجع": formatted_references_text,
        "قائمة المراجع": formatted_references_text,
        "المصادر": formatted_references_text,
        "مصادر": formatted_references_text,
        "المصادر_والمراجع": formatted_references_text,
        "المصادر والمراجع": formatted_references_text,
        "references_text": formatted_references_text,
        "bibliography": formatted_references_text,

        # الحواشي والتخريج (نص كامل ومفصل بكافة المسميات العربية والإنجليزية)
        "الحاشية": formatted_footnotes_text,
        "الحاشيه": formatted_footnotes_text,
        "حاشية": formatted_footnotes_text,
        "حاشيه": formatted_footnotes_text,
        "الحواشي": formatted_footnotes_text,
        "حواشي": formatted_footnotes_text,
        "الهامش": formatted_footnotes_text,
        "هامش": formatted_footnotes_text,
        "الهوامش": formatted_footnotes_text,
        "هوامش": formatted_footnotes_text,
        "التخريج": formatted_footnotes_text,
        "تخريج": formatted_footnotes_text,
        "تخريج_الآثار": formatted_footnotes_text,
        "footnote": formatted_footnotes_text,
        "footnotes": formatted_footnotes_text,
        "footnotes_text": formatted_footnotes_text,
        "footnote_text": formatted_footnotes_text,
        "hashiah": formatted_footnotes_text,
        "alhashia": formatted_footnotes_text,
        "al_hashiah": formatted_footnotes_text,
        "hawashi": formatted_footnotes_text,
        "al_hawashi": formatted_footnotes_text,
        "alhawashi": formatted_footnotes_text,
        "takhrij": formatted_footnotes_text,
        "notes": formatted_footnotes_text,

        # مصفوفة الحواشي للجداول والتكرار (Repeaters)
        "footnotes_list": footnotes_list,
        "hashiya_list": footnotes_list,
        "alhashia_list": footnotes_list,
        "hawashi_list": footnotes_list,
        "الحواشي_قائمة": footnotes_list,
        "قائمة_الحواشي": footnotes_list,
        "قائمة_الحاشية": footnotes_list,

        # المحتوى العام والجواب
        "answer": answer,
        "content": answer,
        "body": answer,
        "text": answer,
        "response": answer,
        "description": answer,
        "summary": answer,

        # التواريخ والإحصائيات
        "date": time.strftime("%Y-%m-%d"),
        "date_ar": time.strftime("%Y/%m/%d"),
        "hijri_date": "١٤٤٧ هـ",
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
        "sources_count": len(references_list),
        "count": len(references_list),
        "total": len(references_list),

        # القوائم والجداول
        "sources": formatted_sources,
        "items": formatted_sources,
        "references": formatted_sources,
        "citations": formatted_sources,
        "books": formatted_sources,
        "documents": formatted_sources,
    }

    # دمج أي حقول إضافية مستخرجة من الـ JSON الأصلي
    for k, v in sections.items():
        if k not in payload_data:
            payload_data[k] = v

    # إذا قام المستخدم بلصق هيكلة بيانات مخصصة من تبويب Data في CraftMyPDF
    if custom_data_schema:
        schema_dict = None
        if isinstance(custom_data_schema, dict):
            schema_dict = custom_data_schema
        elif isinstance(custom_data_schema, str) and custom_data_schema.strip():
            try:
                schema_dict = json.loads(custom_data_schema.strip())
            except Exception as je:
                print(f"[CraftMyPDF] Warning: Failed to parse custom_data_schema JSON: {je}")

        if isinstance(schema_dict, dict) and schema_dict:
            populated_custom = populate_custom_craft_schema(schema_dict, payload_data)
            # دمج الحقول المخصصة مع الإبقاء على كافة المتغيرات القياسية في الجذر لتفادي undefined
            final_data = dict(payload_data)
            final_data.update(populated_custom)
            payload_data = final_data

    # إضافة إسناد ذاتي nested data تحسباً لأي تعبير data.data
    payload_data["data"] = dict(payload_data)

    req_body = {
        "template_id": template_id,
        "data": payload_data,
        "output_file": f"shamela_research_{int(time.time())}.pdf",
        "is_async": False
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            "https://api.craftmypdf.com/v1/create",
            headers={
                "X-API-KEY": api_key,
                "Content-Type": "application/json"
            },
            json=req_body
        )
        if res.status_code != 200:
            raise Exception(_extract_api_error("CraftMyPDF", res.status_code, res.text))

        data = res.json()
        pdf_url = data.get("file") or data.get("pdf_url") or data.get("url") or ""
        return {
            "status": "success",
            "file": pdf_url,
            "pdf_url": pdf_url,
            "filename": req_body["output_file"],
            "title": title_val,
            "transaction_ref": data.get("transaction_ref", ""),
            "raw": data
        }


# ==================== خط أنابيب النماذج المساعدة المتخصصة (Multi-Agent Pipeline) ====================

def build_assistants_manifest_block(active_list: List[Dict[str, Any]]) -> str:
    """توليد نص قائمة فريق المساعدين المتخصصين الملحقة تلقائياً بنهاية موجه النموذج الأساسي."""
    if not active_list:
        return ""
    lines = [
        "[فريق النماذج المساعدة المتخصصة المتاحة لك (Specialized Assistant Agents)]:",
        "لديك فريق من المساعدين المتخصصين يمكنك تفكيك المسألة والاستعانة بهم بحسب تخصص كل منهم:"
    ]
    for idx, ast in enumerate(active_list, start=1):
        name = ast.get("name", f"مساعد_{idx}")
        role = ast.get("role", "تخصص وبحث علمي")
        lines.append(f"{idx}. [{name}]: تخصص ({role})، ويبحث في نطاق كتبه الخاصة.")
    lines.append("")
    lines.append("استند إلى تقارير هؤلاء المساعدين، وتحقق من سد أي نقص أو عجز علمي، ثم ادمج نتائجهم في تحرير علمي رصين ومستوفٍ موثق حسب المطلوب.")
    lines.append("*مهم* لا تذكر في إجابتك الاعتماد على المساعدين أو النسبة إليهم مثل: قال المساعد.. أو هذا ما استخرجه المساعد؛ بل يجب الوثوق بهم تماما وفي حال عدم وجود إجابة من اي مساعد تجاوز المساعد دون تعليق.")
    return "\n".join(lines)

async def run_multi_agent_pipeline(
    provider: str,
    api_key: str,
    main_model: str,
    main_system_prompt: str,
    query: str,
    assistants: List[Dict[str, Any]],
    search_fn: Callable[[Dict[str, Any]], Coroutine[Any, Any, Dict[str, Any]]],
    enable_gap_fill: bool = True,
    structured_format: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 8000,
    base_url: Optional[str] = None,
    cloud_api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    تنفيذ خط أنابيب متكامل من النماذج المساعدة المتخصصة (Multi-Agent Pipeline):
    1. تفكيك المسألة بواسطة النموذج الرئيسي وتوزيع المهام الفرعية على المساعدين (سيبويه، البخاري، مالك...).
    2. استرجاع النصوص وبحث RAG تخصصي محصور في كتب ونطاق كل مساعد بالتوازي (Parallel Execution).
    3. توليد التقارير التخصصية من كل مساعد.
    4. فحص النقص والعجز التكميلي وسد الثغرات المتبقية.
    5. الصياغة والتحقيق النهائي الشامل الموثق بالحواشي وقائمة المصادر.
    """
    t0 = time.time()
    active_assistants = [a for a in assistants if a.get("enabled", True)]
    if not active_assistants:
        raise ValueError("لا يوجد أي نموذج مساعد نشط. يرجى تفعيل نموذج مساعد واحد على الأقل في الإعدادات.")

    pipeline_log = {
        "plan": "",
        "subtasks": [],
        "gap_analysis": {"has_gap": False, "reason": "", "followup": None},
        "assistants_executed": []
    }
    all_combined_sources = []
    seen_source_keys = set()

    def _add_sources(new_sources):
        for s in new_sources:
            key = (s.get("title_ar", ""), str(s.get("part", "")), str(s.get("page_num", "")))
            if key not in seen_source_keys:
                seen_source_keys.add(key)
                all_combined_sources.append(s)

    # -------------------------------------------------------------
    # تجهيز موجه النظام للنموذج الأساسي بإلحاق فريق المساعدين النشطين
    # -------------------------------------------------------------
    manifest_block = build_assistants_manifest_block(active_assistants)
    clean_main_system = main_system_prompt or ""
    marker = "[فريق النماذج المساعدة المتخصصة المتاحة لك (Specialized Assistant Agents)]"
    if marker in clean_main_system:
        clean_main_system = clean_main_system.split(marker)[0].strip()

    effective_main_system_prompt = (clean_main_system + "\n\n" + manifest_block).strip() if manifest_block else clean_main_system

    def find_assistant_by_query_or_name(called_name: str, ast_list: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not called_name:
            return None
        called_clean = str(called_name).strip().lower()
        called_clean = re.sub(r"^\d+[\.\-\s]*", "", called_clean)
        called_clean = re.sub(r"[\[\]\"\'\(\)]", "", called_clean).strip()
        
        # 1. تطابق تام مع الـ ID أو الاسم
        for a in ast_list:
            if a.get("id", "").strip().lower() == called_clean:
                return a
            if a.get("name", "").strip().lower() == called_clean:
                return a
                
        # 2. احتواء جزئي في الاسم
        for a in ast_list:
            a_name = a.get("name", "").strip().lower()
            if called_clean in a_name or a_name in called_clean:
                return a
                
        # 3. تطابق بالكلمات المفتاحية والتخصص
        keywords_map = [
            (["لغو", "معاجم", "لسان", "اشتقاق", "سيبويه", "ألفاظ"], ["لغو", "معاجم", "لسان"]),
            (["محدث", "حديث", "سنة", "رواية", "بخاري"], ["محدث", "حديث", "سنة"]),
            (["مخرج", "تخريج", "علل", "حكم على الحديث", "صحة"], ["مخرج", "تخريج", "علل"]),
            (["أثر", "سلف", "صحابة", "تابعين", "آثار"], ["أثر", "سلف"]),
            (["مالك", "مدونة", "موطأ", "مالكي"], ["مالك", "مالكي"]),
            (["شافع", "أم", "رسالة", "شافعي"], ["شافع", "شافعي"]),
            (["حنب", "أحمد", "مغني", "حنبلي"], ["حنب", "حنبلي"]),
            (["حنف", "هداية", "مبسوط", "حنفي"], ["حنف", "حنفي"]),
            (["مقارن", "خلاف عالي", "مذاهب"], ["مقارن", "مذاهب"]),
            (["أصول", "مقاصد", "دلالات", "علة", "أصولي"], ["أصول", "مقاصد"]),
            (["أسباب الخلاف", "منشأ الخلاف", "توجيه الخلاف", "مجتهد"], ["خلاف", "أسباب الخلاف"]),
            (["قواعد", "فروق", "أشباه", "نظائر", "ضوابط", "مناظر"], ["قواعد", "فروق"]),
            (["تفسير", "قرآن", "آيات"], ["تفسير", "قرآن"]),
        ]
        for triggers, targets in keywords_map:
            if any(t in called_clean for t in triggers):
                for a in ast_list:
                    a_text = (a.get("name", "") + " " + a.get("role", "") + " " + a.get("id", "")).lower()
                    if any(tar in a_text for tar in targets):
                        return a
        return None

    # -------------------------------------------------------------
    # المرحلة الثانية: التنفيذ المتوازي للمساعدين (Parallel Execution & Sub-RAG)
    # -------------------------------------------------------------
    async def _execute_single_assistant(task_info: Dict[str, Any]) -> Dict[str, Any]:
        ast_cfg = task_info.get("cfg")
        if not ast_cfg:
            return None

        ast_id = ast_cfg.get("id")
        subq = task_info.get("subquery", query)
        obj = task_info.get("task_objective", "")

        # 1. استرجاع نصوص الشاملة الخاصة بهذا المساعد وفق كتبه ونطاقه
        book_titles = ast_cfg.get("book_titles") or []
        cat_id = ast_cfg.get("category_id")
        rag_lim = max(3, min(ast_cfg.get("rag_limit", 10), 500))
        rag_m = ast_cfg.get("rag_mode", "hybrid")
        ast_coll = ast_cfg.get("collection_name") or "badr_all_tsh_corpus"
        ast_rerank = ast_cfg.get("use_reranker", True)
        ast_rerank_limit = ast_cfg.get("reranker_limit")
        if ast_rerank_limit:
            try:
                ast_rerank_limit = int(ast_rerank_limit)
            except Exception:
                ast_rerank_limit = None

        search_payload = {
            "query": subq,
            "mode": rag_m if rag_m != "full" else "hybrid",
            "collection_name": ast_coll,
            "use_reranker": ast_rerank,
            "reranker_limit": ast_rerank_limit,
            "category_id": cat_id,
            "book_titles": book_titles if book_titles else None,
            "limit": rag_lim
        }

        retrieved_sources = []
        try:
            s_res = await search_fn(search_payload)
            retrieved_sources = s_res.get("results", [])
        except Exception as se:
            print(f"Sub-RAG search error for {ast_cfg.get('name')}: {se}")

        # صياغة السياق المسترجع بدقة مع جلب النص الكامل وتنظيف وسوم HTML
        context_blocks = []
        for i, s in enumerate(retrieved_sources, start=1):
            b_title = s.get("title_ar", "كتاب تراثي")
            b_author = s.get("author_name") or s.get("main_author_name_ar") or s.get("author", "")
            part = s.get("part", "")
            page = s.get("page_num", "")
            loc = f" (جـ {part}، صـ {page})" if part or page else ""
            
            # جلب متن الصفحة من الحقول الصحيحة (full_body أو snippet أو text)
            raw_txt = s.get("full_body") or s.get("snippet") or s.get("clean_text") or s.get("text") or s.get("body") or ""
            txt = re.sub(r'<[^>]+>', ' ', raw_txt)
            txt = re.sub(r'[ \t]+', ' ', txt).strip()
            
            # إرفاق الحاشية والتخريج إن وُجدت
            fn = s.get("footnotes")
            if fn and str(fn).strip():
                clean_fn = re.sub(r'<[^>]+>', ' ', str(fn)).strip()
                if clean_fn:
                    txt += f"\n[الحاشية والتخريج]: {clean_fn}"
                    
            context_blocks.append(f"[{i}] {b_title} - {b_author}{loc}:\n{txt}")

        joined_context = "\n\n---\n\n".join(context_blocks) if context_blocks else "لم يتم العثور على نصوص مباشرة في نطاق الكتب المحدد لهذا المساعد."

        # 2. تحديد نموذج ومزود هذا المساعد بدقة بالغة
        raw_prov = ast_cfg.get("provider")
        ast_provider = raw_prov if raw_prov and raw_prov != "inherit" else provider

        # تحديد مفتاح API لهذا المساعد بدقة
        ast_key = ast_cfg.get("api_key")
        if not ast_key:
            if ast_provider == "lmstudio":
                ast_key = api_key or "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu"
            elif ast_provider in ("ollama", "local", "huggingface", "gguf"):
                ast_key = ""
            elif ast_provider == "openrouter":
                ast_key = cloud_api_key or api_key
            else:
                ast_key = cloud_api_key or api_key

        # نقطة النهاية للخوادم المحلية
        ast_base_url = ast_cfg.get("base_url") or ast_cfg.get("endpoint_url")
        if not ast_base_url:
            if ast_provider == "lmstudio":
                ast_base_url = base_url or "http://192.168.100.134:1234"
            elif ast_provider == "ollama":
                ast_base_url = base_url or "http://localhost:11434"
            elif ast_provider in ("local", "huggingface", "gguf"):
                ast_base_url = None
            else:
                ast_base_url = None

        raw_model = ast_cfg.get("model")
        if raw_model and str(raw_model).strip() and str(raw_model).strip() not in ("auto_platform_default", "auto", ""):
            ast_model = str(raw_model).strip()
        else:
            ast_model = main_model

        ast_temp = float(ast_cfg.get("temperature", 0.2))
        raw_ast_tokens = int(ast_cfg.get("max_tokens", 3500))
        # تفادي الخلط بين حجم نافذة السياق وسقف رموز التوليد المخرجة لضمان سرعة الاستجابة
        ast_tokens = min(raw_ast_tokens, 4000) if raw_ast_tokens > 8192 else max(800, raw_ast_tokens)
        
        ast_role = ast_cfg.get("role", "التحقيق في نطاق اختصاصه وكتبه")
        ast_output_format = (ast_cfg.get("output_format") or "").strip()
        if not ast_output_format:
            ast_output_format = "تقرير تحقيقي علمي رصين ومستوفٍ مع العزو المكتبي الصريح (الكتاب، المؤلف، الجزء، الصفحة) وقائمة المصادر والمراجع."

        base_ast_system = ast_cfg.get("system_prompt") or f"أنت الباحث التخصصي: {ast_cfg.get('name')}."
        ast_system = (
            f"{base_ast_system}\n\n"
            "====================================================\n"
            "[ضوابط الالتزام الصارم بالتوجيه الفرعي وطريقة الإخراج الحصرية]:\n"
            f"1. التوجيه الفرعي المخصص لك حصراً: «{ast_role}».\n"
            "   ⚠️ إياك قطعاً أن تتجاوز هذا التوجيه الفرعي أو تجيب عن فروع أخرى تخرج عن هذا الاختصاص المحدد لك.\n"
            f"2. طريقة وهيئة الإخراج الإلزامية: «{ast_output_format}».\n"
            "   ⚠️ التزم بهذه الطريقة في الإخراج حرفياً دون تبديل أو خروج عن الهيكلة المحددة.\n"
            "   ⚠️ تحذير صارم وحاسم: يُمنع منعاً باتاً استخدام أي عناوين أو تقسيمات عامة دخيلة (مثل: صورة المسألة، تحرير محل النزاع، سبب الخلاف، الأقوال في المسألة، الأدلة، الترجيح)! يجب أن يكون كامل مخرجك مطابقاً حصراً لطريقة وهيئة الإخراج المحددة أعلاه دون غيرها.\n"
            "===================================================="
        )

        print(f"[Pipeline] Executing Assistant: '{ast_cfg.get('name')}' | Model: '{ast_model}' | Provider: '{ast_provider}' | Scope: {len(book_titles)} books")

        user_content = (
            f"[المسألة المبحوثة]:\n{subq}\n\n"
            f"[التوجيه الفرعي المخصص لك حصراً]:\n{ast_role}\n"
            "⚠️ تنبيه إلزامي: أجب حصراً وبدقة متناهية عما كُلفت به في التوجيه الفرعي أعلاه فقط، ولا تتناول جوانب خارج تخصصك.\n\n"
            f"[طريقة وهيئة الإخراج الإلزامية]:\n{ast_output_format}\n"
            "⚠️ تنبيه حاسم: التزم حرفياً بهيئة الإخراج المحددة أعلاه، ولا تكتب أي عناوين عامة مثل (صورة المسألة، تحرير محل النزاع، الأقوال في المسألة، الترجيح).\n\n"
            f"[نصوص المكتبة الشاملة المرفقة بنطاق اختصاصك وكتبك]:\n{joined_context}\n\n"
            "حرر جوابك التخصصي ملتزماً تماماً بالتوجيه الفرعي الموجه لك ومتقيداً بطريقة الإخراج المحددة أعلاه، مع العزو المكتبي الصريح (الكتاب، المؤلف، الجزء، الصفحة)."
        )

        try:
            resp = await call_ai_chat(
                provider=ast_provider,
                api_key=ast_key,
                model=ast_model,
                messages=[{"role": "user", "content": user_content}],
                system_prompt=ast_system,
                temperature=ast_temp,
                max_tokens=ast_tokens,
                base_url=ast_base_url,
                enforce_fiqh_template=False
            )
            raw_c = resp.get("content")
            if raw_c is None:
                raw_c = resp.get("reasoning") or ""
            report_text = str(raw_c).strip()
        except Exception as e:
            print(f"[Pipeline] Assistant '{ast_cfg.get('name')}' model '{ast_model}' on '{ast_provider}' failed ({e}).")
            # لا نلجأ للنموذج الأساسي إلا إذا كان المزودان متطابقين لتفادي إغراق الخادم المحلي بمساعدين سحابيين
            can_fallback_to_main = (
                ast_provider == provider and 
                ast_model != main_model and 
                provider not in ("ollama", "lmstudio")
            )
            if can_fallback_to_main:
                try:
                    resp = await call_ai_chat(
                        provider=provider,
                        api_key=api_key,
                        model=main_model,
                        messages=[{"role": "user", "content": user_content}],
                        system_prompt=ast_system,
                        temperature=ast_temp,
                        max_tokens=ast_tokens,
                        base_url=base_url,
                        enforce_fiqh_template=False
                    )
                    raw_c = resp.get("content")
                    if raw_c is None:
                        raw_c = resp.get("reasoning") or ""
                    report_text = str(raw_c).strip()
                    ast_model = f"{main_model} (بديل)"
                except Exception as e2:
                    report_text = f"تعذر استجابة المساعد ({ast_cfg.get('name')}): {str(e2)}"
            else:
                report_text = f"تعذر استجابة المساعد ({ast_cfg.get('name')} عبر {ast_provider}): {str(e)}"

        return {
            "assistant_id": ast_id,
            "assistant_name": ast_cfg.get("name", ast_id),
            "role": ast_role,
            "output_format": ast_output_format,
            "subquery": subq,
            "objective": ast_role,
            "model_used": ast_model,
            "provider_used": ast_provider,
            "report": report_text,
            "sources": retrieved_sources,
            "sources_count": len(retrieved_sources)
        }

    # -------------------------------------------------------------
    # المرحلة الأولى: النموذج الأساسي يحلل المسألة ويحدد المساعدين والطلبات (Lead Orchestration)
    # -------------------------------------------------------------
    orchestrator_prompt = (
        f"[سؤال الباحث]:\n{query}\n\n"
        "====================================================\n"
        "[توجيه العمل والتحليل والتنسيق الفقهي المطلوب منك]:\n"
        "أنت النموذج الأساسي والمحقق الرئيس وقائد فريق المساعدين المتخصصين.\n"
        "انظر في مسألة الباحث أعلاه وقم بما يلي:\n"
        "1. حلل المسألة الفقهية بدقة: وإذا كانت من المسائل المعاصرة أو الفنية ففككها إلى مصطلحاتها ونظائرها في الفقه الإسلامي ومظانها في كتب التراث (مثال: ما حكم نفي النسب بالـ DNA؟ نظائرها ومظانها: اللعان، القيافة والشبه، الولد للفراش وللعاهر الحجر، استلحاق النسب، حجية القرائن القطعية والظنية في مقابلة النصوص ومقاصد الشريعة في حفظ الأنساب والتشوف لثبوتها).\n"
        "2. استعن بفريق النماذج المساعدة المتاحين لك في موجه النظام بحسب تخصص كل منهم، ووزع المسألة عليهم ليستخرجوا لك النصوص والأدلة والآثار من كتبهم التراثية ونطاقاتهم الخاصة.\n"
        "3. صغ لكل مساعد سؤالاً أو طلباً تخصصياً دقيقاً وموجهاً بلغة تراثية دقيقة تتناسب مع تخصصه ونطاق كتبه وطريقة إخراجه.\n\n"
        "أخرج قرارك حصراً بتنسيق JSON الآتي (دون أي كلام أو مقدمات خارجه نهائياً):\n"
        "{\n"
        '  "thought": "تحليلك الفقهي للمسألة، وتفكيك النظائر والمصطلحات التراثية ومظانها، وخطة استدعاء المساعدين...",\n'
        '  "calls": [\n'
        '    {\n'
        '      "assistant_name": "اسم المساعد كما ورد في قائمة موجه النظام",\n'
        '      "query": "السؤال أو الطلب التخصصي المحدد الموجه لهذا المساعد"\n'
        '    }\n'
        '  ]\n'
        "}\n"
    )

    lead_thought = ""
    target_tasks = []

    try:
        orch_resp = await call_ai_chat(
            provider=provider,
            api_key=api_key,
            model=main_model,
            messages=[{"role": "user", "content": orchestrator_prompt}],
            system_prompt=effective_main_system_prompt,
            temperature=0.2,
            max_tokens=3000,
            base_url=base_url,
            enforce_fiqh_template=False
        )
        orch_text = (orch_resp.get("content") or orch_resp.get("reasoning") or "").strip()
        
        parsed_plan = None
        clean_text = orch_text
        if "```" in clean_text:
            m_code = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean_text)
            if m_code:
                clean_text = m_code.group(1).strip()
            else:
                clean_text = re.sub(r"^```[a-zA-Z]*\n?", "", clean_text)
                clean_text = re.sub(r"\n?```$", "", clean_text).strip()

        try:
            parsed_plan = json.loads(clean_text)
        except Exception:
            m = re.search(r"(\{[\s\S]*\})", clean_text)
            if m:
                try:
                    parsed_plan = json.loads(m.group(1))
                except Exception:
                    pass

        # محاولة إصلاح الـ JSON المبتور
        if not parsed_plan and "{" in clean_text:
            snippet = clean_text[clean_text.find("{"):]
            for suffix in [']}', '"]}', '"}]}', '"}', '}']:
                try:
                    parsed_plan = json.loads(snippet + suffix)
                    if parsed_plan:
                        break
                except Exception:
                    pass

        if isinstance(parsed_plan, dict):
            lead_thought = str(parsed_plan.get("thought") or "").strip()
            raw_calls = parsed_plan.get("calls") or []
            for c in raw_calls:
                c_name = c.get("assistant_name") or c.get("name") or c.get("id") or ""
                c_q = c.get("query") or c.get("question") or ""
                matched_ast = find_assistant_by_query_or_name(c_name, active_assistants)
                if matched_ast:
                    # التحقق من عدم تكرار إضافة نفس المساعد
                    if not any(t["cfg"].get("id") == matched_ast.get("id") for t in target_tasks):
                        sub_query = c_q.strip() if c_q.strip() else f"تحقيق مسألة ({query}) في نطاق اختصاصك وكتبك المعتمدة"
                        target_tasks.append({"cfg": matched_ast, "subquery": sub_query})
        else:
            lead_thought = orch_text
    except Exception as e:
        print(f"[Pipeline] Orchestrator planning call failed: {e}")
        lead_thought = f"تحليل المسألة المباشرة وتوجيه الاستعلامات للمساعدين التخصصيين: {query}"

    # إذا لم يستخرج النموذج الأساسي استدعاءات صريحة، ننتقي المساعدين النشطين ونصوغ لهم طلبات متناسبة مع تخصصاتهم
    if not target_tasks and active_assistants:
        for a in active_assistants:
            ast_name = a.get("name", "")
            ast_role = a.get("role", "")
            if any(k in ast_name or k in ast_role for k in ["لغو", "معاجم", "لسان", "اشتقاق"]):
                sub_q = f"بيان المعاني اللغوية والاشتقاقية لمصطلحات ونظائر المسألة: {query}"
            elif any(k in ast_name or k in ast_role for k in ["محدث", "سنة", "تخريج", "حديث"]):
                sub_q = f"تخريج الأحاديث والآثار النبوية الواردة في أصول ونظائر المسألة: {query}"
            elif any(k in ast_name or k in ast_role for k in ["أصول", "مقاصد"]):
                sub_q = f"تحرير القواعد الأصولية والمقاصدية المؤثرة في نازلة: {query}"
            elif any(k in ast_name or k in ast_role for k in ["مالك", "شافع", "حنب", "حنف", "فقه"]):
                sub_q = f"تحقيق فروع وأصول المذهب في مسألة: {query} ونظائرها في كتب التراث"
            else:
                sub_q = f"تحقيق مسألة ({query}) واستخراج النصوص التراثية في نطاق اختصاصك"
            target_tasks.append({"cfg": a, "subquery": sub_q})

    pipeline_log["plan"] = lead_thought or "قام النموذج الأساسي بتحليل المسألة وتحديد النماذج المساعدة وتوزيع الاستعلامات التخصصية."

    # -------------------------------------------------------------
    # المرحلة الثانية: استدعاء وتشغيل النماذج المساعدة وفق طلبات النموذج الأساسي
    # -------------------------------------------------------------
    assistant_coros = [_execute_single_assistant(t) for t in target_tasks]
    assistant_results = await asyncio.gather(*assistant_coros, return_exceptions=True)

    valid_reports = []
    for r in assistant_results:
        if isinstance(r, dict) and r:
            valid_reports.append(r)
            _add_sources(r.get("sources", []))
            pipeline_log["assistants_executed"].append({
                "id": r["assistant_id"],
                "name": r["assistant_name"],
                "role": r["role"],
                "output_format": r.get("output_format"),
                "model_used": r.get("model_used"),
                "subquery": r["subquery"],
                "sources_count": r["sources_count"]
            })

    pipeline_log["subtasks"] = valid_reports

    # -------------------------------------------------------------
    # المرحلة الثالثة: النموذج الأساسي يستلم التقارير ويحرر الترجيح والنتيجة النهائية
    # -------------------------------------------------------------
    reports_text_blocks = []
    for r in valid_reports:
        reports_text_blocks.append(
            f"=== [تقرير المساعد التخصصي: {r['assistant_name']}] ===\n"
            f"> الاستعلام والطلب الموجه له: {r.get('subquery')}\n"
            f"> نصوص التحقيق والتخريج المستخرجة من كتبه التخصصية:\n"
            f"{r.get('report')}\n"
        )
    joined_assistant_dossier = "\n\n".join(reports_text_blocks) if reports_text_blocks else "لم ترد تقارير إضافية من المساعدين."

    final_synthesis_prompt = (
        f"[سؤال الباحث الأصلي]:\n{query}\n\n"
        f"[تحليلك وتفكيكك الفقهي للنظائر والمصطلحات التراثية ومظانها]:\n{lead_thought}\n\n"
        f"[حصيلة تقارير فريق النماذج المساعدة المستخلصة من أمهات كتب الشاملة]:\n"
        f"{joined_assistant_dossier}\n\n"
        "====================================================\n"
        "[المهمة الإلزامية للمحقق الرئيس]:\n"
        "استند إلى تقارير هؤلاء المساعدين ونصوص كتبهم التراثية المرفقة، وتحقق من سد أي نقص أو عجز علمي، ثم ادمج نتائجهم في تحرير علمي رصين ومستوفٍ موثق حسب المطلوب في توجيهك، مع بيان القول الراجح وعلة الترجيح وأدلة المسألة وتوثيق النقول بالجزء والصفحة.\n\n"
        "*مهم جداً*: لا تذكر في إجابتك الاعتماد على المساعدين أو النسبة إليهم مثل: قال المساعد.. أو هذا ما استخرجه المساعد؛ بل يجب الوثوق بهم تماماً وصياغة التحقيق بأسلوبك كباحث ومحقق رئيس يوثق من أمهات الكتب والمصادر التراثية مباشرة."
    )

    final_answer = ""
    try:
        synth_resp = await call_ai_chat(
            provider=provider,
            api_key=api_key,
            model=main_model,
            messages=[{"role": "user", "content": final_synthesis_prompt}],
            system_prompt=effective_main_system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            base_url=base_url,
            enforce_fiqh_template=False
        )
        final_answer = (synth_resp.get("content") or synth_resp.get("reasoning") or "").strip()
    except Exception as se:
        print(f"[Pipeline] Final synthesis by main model failed: {se}")

    # احتياطي: إذا تعذر على النموذج الأساسي التوليد، نعرض تقارير المساعدين بدقة
    if not final_answer:
        fallback_blocks = []
        for r in valid_reports:
            fallback_blocks.append(
                f"### 👤 {r['assistant_name']}\n"
                f"> 🎯 **التوجيه المطلوب:** {r.get('subquery', '')}\n"
                f"> 📐 **طريقة الإخراج:** {r.get('output_format', '')}\n\n"
                f"{r.get('report', '')}\n"
            )
        final_answer = "\n---\n".join(fallback_blocks)

    t_total = round(time.time() - t0, 2)

    return {
        "status": "success",
        "answer": final_answer,
        "pipeline_flow": pipeline_log,
        "assistant_reports": valid_reports,
        "subtasks": valid_reports,
        "sources": all_combined_sources,
        "stats": {
            "total_assistants_called": len(valid_reports),
            "total_sources_retrieved": len(all_combined_sources),
            "time_taken_seconds": t_total,
            "main_model": main_model
        }
    }


