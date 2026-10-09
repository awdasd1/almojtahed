import os
import gc
import re
import json
import time
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional, AsyncGenerator

# مجلد النماذج المحلي الافتراضي
DEFAULT_MODELS_DIR = os.getenv(
    "SHAMELA_MODELS_DIR",
    str(Path(__file__).resolve().parent.parent / "models")
)

# ذاكرة مؤقتة لنموذج نشط واحد لتجنب إعادة التحميل في كل استعلام
_LOADED_MODEL_ID: Optional[str] = None
_LOADED_MODEL_INSTANCE: Any = None
_LOADED_MODEL_TYPE: Optional[str] = None  # 'gguf' or 'transformers'
_LOADED_TOKENIZER: Any = None


def get_models_directory() -> Path:
    """الحصول على مسار مجلد النماذج والتأكد من وجوده."""
    p = Path(DEFAULT_MODELS_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def format_file_size(size_bytes: int) -> str:
    """تحويل الحجم إلى قراءة سهلة (GB أو MB)."""
    if size_bytes >= 1024 ** 3:
        return f"{size_bytes / (1024 ** 3):.2f} GB"
    elif size_bytes >= 1024 ** 2:
        return f"{size_bytes / (1024 ** 2):.1f} MB"
    return f"{size_bytes / 1024:.1f} KB"


def scan_local_models(custom_dir: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    فحص مجلد النماذج المحلي واكتشاف:
    1. ملفات GGUF (*.gguf)
    2. مجلدات Hugging Face (التي تحوي config.json و safetensors / bin)
    """
    models_path = Path(custom_dir) if custom_dir else get_models_directory()
    if not models_path.exists():
        return []

    discovered: List[Dict[str, Any]] = []

    # 1. البحث عن ملفات GGUF في المجلد ومجلداته الفرعية
    for item in models_path.rglob("*.gguf"):
        if item.is_file():
            size = item.stat().st_size
            rel_path = item.relative_to(models_path)
            clean_name = item.stem.replace("-", " ").replace("_", " ").title()
            
            # تمييز التكميم إن وجد (مثل Q4_K_M, Q5_K_S)
            quant_match = re.search(r'(Q\d_[A-Z0-9_]+|q\d_[a-z0-9_]+)', item.stem, re.I)
            quant_label = f" ({quant_match.group(1).upper()})" if quant_match else ""

            discovered.append({
                "id": str(rel_path),
                "name": f"{clean_name}{quant_label} [GGUF]",
                "filename": item.name,
                "format": "gguf",
                "path": str(item.resolve()),
                "size_bytes": size,
                "size_str": format_file_size(size),
                "company": "local",
                "context_length": 8192
            })

    # 2. البحث عن مجلدات نماذج Hugging Face (safetensors / transformers)
    for sub in models_path.iterdir():
        if sub.is_dir() and (sub / "config.json").exists():
            # حساب الحجم الإجمالي لمجلد النموذج
            total_size = sum(f.stat().st_size for f in sub.rglob("*") if f.is_file())
            clean_name = sub.name.replace("-", " ").replace("_", " ").title()

            discovered.append({
                "id": sub.name,
                "name": f"{clean_name} [Hugging Face]",
                "filename": sub.name,
                "format": "transformers",
                "path": str(sub.resolve()),
                "size_bytes": total_size,
                "size_str": format_file_size(total_size),
                "company": "local",
                "context_length": 4096
            })

    # فرز النماذج أبجدياً
    discovered.sort(key=lambda x: x["name"].lower())
    return discovered


def unload_active_local_model():
    """تفريغ النموذج النشط من الذاكرة لتوفير الرام."""
    global _LOADED_MODEL_ID, _LOADED_MODEL_INSTANCE, _LOADED_MODEL_TYPE, _LOADED_TOKENIZER
    if _LOADED_MODEL_INSTANCE is not None:
        try:
            del _LOADED_MODEL_INSTANCE
            if _LOADED_TOKENIZER is not None:
                del _LOADED_TOKENIZER
        except Exception:
            pass
        _LOADED_MODEL_ID = None
        _LOADED_MODEL_INSTANCE = None
        _LOADED_MODEL_TYPE = None
        _LOADED_TOKENIZER = None
        gc.collect()
        try:
            import torch
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
            elif torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


def get_or_load_model(model_id_or_path: str):
    """
    تحميل النموذج أو استعادته من الذاكرة إن كان محملاً مسبقاً.
    يدعم صيغ GGUF عبر llama_cpp وصيغ Transformers عبر PyTorch/MPS.
    """
    global _LOADED_MODEL_ID, _LOADED_MODEL_INSTANCE, _LOADED_MODEL_TYPE, _LOADED_TOKENIZER

    models_dir = get_models_directory()
    
    # تحديد المسار الفعلي
    target_path = Path(model_id_or_path)
    if not target_path.exists():
        target_path = models_dir / model_id_or_path
    
    if not target_path.exists():
        # محاولة البحث عن الملف في المجلدات الفرعية
        found = list(models_dir.rglob(model_id_or_path))
        if found:
            target_path = found[0]
        else:
            raise FileNotFoundError(f"لم يتم العثور على النموذج في مجلد النماذج المحلي: {model_id_or_path}")

    # إذا كان النموذج نفسه محملاً بالفعل، نرجعه فوراً
    if _LOADED_MODEL_ID == str(target_path) and _LOADED_MODEL_INSTANCE is not None:
        return _LOADED_MODEL_INSTANCE, _LOADED_MODEL_TYPE, _LOADED_TOKENIZER

    # تفريغ أي نموذج سابق في الذاكرة
    unload_active_local_model()

    # تحديد النوع
    if target_path.suffix.lower() == ".gguf":
        try:
            from llama_cpp import Llama
        except ImportError:
            raise ImportError(
                "مكتبة llama-cpp-python غير مثبتة. يرجى تثبيتها لتشغيل ملفات GGUF."
            )

        print(f"[Local Model] Loading GGUF model with Metal acceleration: {target_path.name}")
        # n_gpu_layers=-1 يعني نقل كافة الطبقات إلى كرت الشاشة (Metal GPU في الماك)
        instance = Llama(
            model_path=str(target_path),
            n_ctx=8192,
            n_gpu_layers=-1,
            verbose=False
        )
        _LOADED_MODEL_ID = str(target_path)
        _LOADED_MODEL_INSTANCE = instance
        _LOADED_MODEL_TYPE = "gguf"
        _LOADED_TOKENIZER = None
        return instance, "gguf", None

    elif target_path.is_dir() and (target_path / "config.json").exists():
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError:
            raise ImportError("مكتبة transformers أو torch غير مثبتة لتشغيل نماذج Hugging Face.")

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        print(f"[Local Model] Loading Hugging Face Transformers model on device ({device}): {target_path.name}")
        
        tokenizer = AutoTokenizer.from_pretrained(str(target_path), trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            str(target_path),
            torch_dtype=torch.float16 if device == "mps" else torch.float32,
            device_map=device if device != "mps" else None,
            trust_remote_code=True
        )
        if device == "mps":
            model = model.to("mps")

        _LOADED_MODEL_ID = str(target_path)
        _LOADED_MODEL_INSTANCE = model
        _LOADED_MODEL_TYPE = "transformers"
        _LOADED_TOKENIZER = tokenizer
        return model, "transformers", tokenizer

    else:
        raise ValueError(f"صيغة الملف غير مدعومة: {target_path.name}. الصيغ المدعومة هي .gguf أو مجلدات Hugging Face.")


async def generate_local_response_stream(
    model_name: str,
    messages: List[Dict[str, str]],
    system_prompt: str = "",
    temperature: float = 0.3,
    max_tokens: int = 3000
) -> AsyncGenerator[str, None]:
    """
    توليد الردود بنمط التدفق (Streaming) من النموذج المحلي مباشرة.
    """
    # التشغيل في thread منفصل لتفادي تجميد حلقة أحداث FastAPI
    loop = asyncio.get_running_loop()

    instance, m_type, tokenizer = await loop.run_in_executor(
        None, get_or_load_model, model_name
    )

    full_messages = []
    if system_prompt and system_prompt.strip():
        full_messages.append({"role": "system", "content": system_prompt.strip()})
    full_messages.extend(messages)

    if m_type == "gguf":
        # توليد عبر llama-cpp create_chat_completion
        def run_gguf():
            return instance.create_chat_completion(
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True
            )

        stream = await loop.run_in_executor(None, run_gguf)
        for chunk in stream:
            choices = chunk.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                content = delta.get("content", "")
                if content:
                    yield content
            await asyncio.sleep(0)

    elif m_type == "transformers":
        import torch
        from transformers import TextIteratorStreamer
        from threading import Thread

        # تنسيق الموجه عبر chat template إن وجد
        if hasattr(tokenizer, "apply_chat_template"):
            prompt = tokenizer.apply_chat_template(
                full_messages, tokenize=False, add_generation_prompt=True
            )
        else:
            prompt = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in full_messages]) + "\nASSISTANT: "

        inputs = tokenizer(prompt, return_tensors="pt")
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        inputs = {k: v.to(device) for k, v in inputs.items()}

        streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
        gen_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=max_tokens,
            temperature=temperature if temperature > 0 else 0.7,
            do_sample=temperature > 0
        )

        thread = Thread(target=instance.generate, kwargs=gen_kwargs)
        thread.start()

        for new_text in streamer:
            if new_text:
                yield new_text
            await asyncio.sleep(0)
