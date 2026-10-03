Here is the connection code
(The user has successfully connected, which is why they are able to chat with you.)
So, when a user asks to switch models, search for and find the newest and best version on Hugging Face.
---

STEP 1
Get Your Ngrok Authtoken
Visit the ngrok Dashboard - Auth Token page.
Log in and copy your personal Authtoken.

STEP 2
Set Up Google Colab
Open a new notebook on Google Colab.
Change the runtime type to GPU: Click **Runtime** in the top menu → **Change runtime type**.
Select **T4 GPU** under **Hardware accelerator** and click **Save**. STEP 3
Run the Server Code
Copy and paste the code block below into a Colab cell, replace your_Authtoken with your actual Ngrok token, and run the cell:

```python
# View other models: https://huggingface.co/models?num_parameters=min:6B,max:12B&library=gguf&sort=trending&search=qwen

print("Installing required packages...(took ~2 min)")
!pip install -q pyngrok huggingface_hub uvicorn pydantic pydantic-settings
!pip install -q "llama-cpp-python[server]" \
  --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu122

import os
import re
import subprocess
import requests
from urllib.parse import quote
from huggingface_hub import hf_hub_download
from pyngrok import ngrok

NGROK_TOKEN = "YOUR_NGROK_AUTHTOKEN" # <-- Paste your Ngrok Authtoken here
API_KEY = "123" # <-- Custom API Key (Change if desired)
CONTEXT_SIZE = 24000 # <-- Recommended: 1248-4096

# ---- Model finder settings (the best GGUF model is picked automatically) ----
TRUSTED_AUTHORS = ["mondk", "unsloth", "bartowski", "qwen"] # <-- Priority: left to right
TARGET_MODEL = "qwen" # <-- Model family to look for
MIN_PARAMS_B = 6 # <-- Smallest model size (billions of parameters)
MAX_PARAMS_B = 14 # <-- Largest model size (billions of parameters)
MAX_SIZE_GB = 10 # <-- Largest GGUF file size allowed
MODEL_REPO_ID = "" # <-- Optional: set BOTH of these to skip the search
MODEL_FILENAME = "" # <-- and download one specific GGUF file instead

ngrok.set_auth_token(NGROK_TOKEN)

HF_URL = "https://huggingface.co"
HF_HEADERS = {"User-Agent": "HuggingFaceExplorer/1.0"}
QUANT_ORDER = [
    ("Q5_K_M", [r"(?:[-_.]|^)(?:ud-)?q5_k_m(?:[-_.]|\.gguf$)", r"(?:[-_.]|^)(?:ud-)?q5_k_xl(?:[-_.]|\.gguf$)"]),
    ("Q4_K_M", [r"(?:[-_.]|^)(?:ud-)?q4_k_m(?:[-_.]|\.gguf$)", r"(?:[-_.]|^)(?:ud-)?q4_k_xl(?:[-_.]|\.gguf$)"]),
    ("IQ4_XS", [r"(?:[-_.]|^)(?:ud-)?iq4_xs(?:[-_.]|\.gguf$)"]),
]

def finder_log(message):
    print("[model-finder] " + message)

def hf_get(url, as_json=True):
    try:
        response = requests.get(url, headers=HF_HEADERS, timeout=30)
        if response.status_code != 200:
            return None
        return response.json() if as_json else response.text
    except Exception as error:
        finder_log("request failed: " + str(error))
        return None

def extract_param_count(model):
    safetensors = model.get("safetensors") or {}
    total = safetensors.get("total")
    if isinstance(total, (int, float)) and total > 0:
        return total
    units = {"B": 1e9, "M": 1e6, "K": 1e3}
    # 1. Standard size token in the id: -7b-, _14b_, .8B.
    match = re.search(r"(?:^|[-_/])([0-9]+(?:\.[0-9]+)?)\s*([bBmMkK])(?=[-_/.]|$)", model["id"])
    if match:
        return round(float(match.group(1)) * units[match.group(2).upper()])
    # 2. Size token embedded in a longer name: vl8b, code7b, qwen3-8b
    match = re.search(r"(?:[\W_]|code|vl|instruct|chat|it|reasoning)([0-9]+(?:\.[0-9]+)?)\s*([bBmM])(?=[\W_]|$)", model["id"], re.I)
    if match:
        return round(float(match.group(1)) * units[match.group(2).upper()])
    # 3. Tags (includes base_model tags)
    for tag in model.get("tags") or []:
        match = re.search(r"(?:^|[-_:/.])([0-9]+(?:\.[0-9]+)?)\s*([bBmM])(?=[-:_/.]|\b|$)", tag)
        if match and float(match.group(1)) < 1000:
            return round(float(match.group(1)) * units[match.group(2).upper()])
    return None

def extract_version(model_id):
    # Versions like 3.5 in "Qwen3.5-9B", but never sizes like the 7 in "7B"
    pattern = re.escape(TARGET_MODEL.strip()) + r"(?:[\s_.-]*(?:vl|coder|math|chat|instruct|it|agent))*[\s_.-]*(?:v)?([0-9]+(?:\.[0-9]+)*)(?![bBmMkK])"
    match = re.search(pattern, model_id, re.I)
    if not match:
        return 1000000, "1.0"
    version = match.group(1)
    parts = []
    for part in version.split("."):
        try:
            parts.append(float(part))
        except ValueError:
            parts.append(0.0)
    if parts[0] > 20: # dates / checkpoints such as 2507
        return 1000000, "1.0"
    score, multiplier = 0.0, 1000000.0
    for part in parts:
        score += part * multiplier
        multiplier /= 1000
    return score, version

def matches_category(model):
    # LLM, Chat & Vision Multimodal (LLM + code/reasoning + vision, no image/audio/embedding models)
    pipeline = (model.get("pipeline_tag") or "").lower()
    tags = [t.lower() for t in (model.get("tags") or [])]
    model_id = model["id"].lower()
    is_vision = (pipeline == "image-text-to-text" or "image-text-to-text" in tags or "vision" in tags
                 or "multimodal" in tags or "-vl" in model_id or "vision" in model_id)
    is_code = (any(t in tags for t in ("code", "coding", "reasoning", "math"))
               or "coder" in model_id or "reasoning" in model_id)
    is_llm = (pipeline in ("text-generation", "conversational")
              or any(t in tags for t in ("text-generation", "llama", "qwen")))
    return is_vision or is_code or is_llm

def usable_gguf_files(siblings):
    # Only real, standalone model weights: no MTP, mmproj, imatrix, adapter, LoRA or draft files
    files = []
    for sibling in siblings or []:
        name = (sibling.get("rfilename") or "").lower()
        if not name.endswith(".gguf"):
            continue
        if "mtp/" in name or "/mtp" in name or name.startswith("mtp") or "-mtp" in name or "_mtp" in name:
            continue
        if "mmproj" in name or "imatrix" in name:
            continue
        if "adapter" in name or "lora" in name or "draft" in name:
            continue
        files.append(sibling)
    return files

def pick_quant(siblings, max_bytes=None):
    # Q5_K_M first, then Q4_K_M, then IQ4_XS; a quant is skipped if it is larger than max_bytes
    files = usable_gguf_files(siblings)
    for quant, patterns in QUANT_ORDER:
        matching = []
        for pattern in patterns:
            matching = [f for f in files if re.search(pattern, f["rfilename"], re.I)]
            if matching:
                break
        if not matching:
            continue
        weights = [f for f in matching if (f.get("size") or 0) > 1024 * 1024]
        chosen = weights if weights else matching
        total = sum((f.get("size") or 0) for f in chosen)
        if total <= 0:
            continue
        if max_bytes is not None and total > max_bytes:
            finder_log(f"  {quant} is {total / 1024 ** 3:.2f} GB (over the {MAX_SIZE_GB} GB limit)")
            continue
        return {"quant": quant, "files": sorted(f["rfilename"] for f in chosen), "size_bytes": total}
    return None

def find_pointed_repo():
    # mondk/best_model_now: its README can point to one specific repo (owner/repo)
    readme = hf_get(HF_URL + "/mondk/best_model_now/raw/main/README.md", as_json=False)
    if readme is None:
        finder_log("mondk/best_model_now is not readable, using the normal search")
        return None
    for line in readme.split("\n"):
        line = line.strip()
        if not line or line.startswith("---") or line.startswith("license:"):
            continue
        match = (re.search(r"huggingface\.co/([a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+)", line)
                 or re.search(r"([a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+)", line))
        if not match:
            continue
        repo = match.group(1).rstrip(".-")
        if repo.lower() != "mondk/best_model_now":
            return repo
    finder_log("mondk/best_model_now does not name a repo, using the normal search")
    return None

def find_best_model():
    authors = [a.strip().lower() for a in TRUSTED_AUTHORS if a.strip()]
    min_params = MIN_PARAMS_B * 1e9
    max_params = MAX_PARAMS_B * 1e9
    max_bytes = MAX_SIZE_GB * 1024 ** 3
    finder_log(f"Looking for {TARGET_MODEL} GGUF models, {MIN_PARAMS_B}-{MAX_PARAMS_B}B, under {MAX_SIZE_GB} GB, authors: {' -> '.join(authors)}")

    # Step 1: mondk/best_model_now may name the repo to use (Q5_K_M -> Q4_K_M -> IQ4_XS, no size limit)
    if "mondk" in authors:
        pointed = find_pointed_repo()
        if pointed:
            finder_log("mondk/best_model_now points to " + pointed)
            info = hf_get(f"{HF_URL}/api/models/{pointed}?blobs=true")
            pick = pick_quant(info.get("siblings"), None) if info else None
            if pick:
                return {"repo_id": pointed, "files": pick["files"], "quant": pick["quant"], "size_bytes": pick["size_bytes"]}
            finder_log(pointed + " has no Q5_K_M / Q4_K_M / IQ4_XS file, using the normal search")

    # Step 2: collect candidates from the trusted authors (mondk is only used as the pointer above)
    search_authors = [a for a in authors if a != "mondk"]
    raw, seen = [], set()
    for rank, author in enumerate(search_authors):
        url = f"{HF_URL}/api/models?author={quote(author, safe='')}&search={quote(TARGET_MODEL, safe='')}&limit=30&full=true"
        listing = hf_get(url)
        for model in listing if isinstance(listing, list) else []:
            if model["id"] not in seen:
                seen.add(model["id"])
                model["_rank"] = rank
                raw.append(model)
    if len(raw) < 5:
        url = f"{HF_URL}/api/models?search={quote(TARGET_MODEL + ' gguf', safe='')}&limit=40&full=true"
        listing = hf_get(url)
        for model in listing if isinstance(listing, list) else []:
            if model["id"] not in seen:
                seen.add(model["id"])
                owner = model["id"].split("/")[0].lower()
                model["_rank"] = search_authors.index(owner) if owner in search_authors else 99
                raw.append(model)
    finder_log(f"Found {len(raw)} raw candidates")

    candidates = []
    for model in raw:
        model_id = model["id"]
        lower_id = model_id.lower()
        is_mtp_repo = "-mtp" in lower_id or "_mtp" in lower_id or "/mtp" in lower_id
        tags = [t.lower() for t in (model.get("tags") or [])]
        if not (("gguf" in lower_id or "gguf" in tags) and not is_mtp_repo):
            continue
        params = extract_param_count(model)
        version_num, version = extract_version(model_id)
        candidates.append({
            "id": model_id,
            "rank": model["_rank"],
            "params": params,
            "in_range": params is not None and min_params <= params <= max_params,
            "in_category": matches_category(model),
            "version_num": version_num,
            "version": version,
            "downloads": model.get("downloads") or 0,
        })

    # Order: size range, category, newest version, author priority, downloads
    candidates.sort(key=lambda c: (not c["in_range"], not c["in_category"], -c["version_num"], c["rank"], -c["downloads"]))
    finder_log(f"{len(candidates)} GGUF candidates, checking the best {min(15, len(candidates))}")

    # Step 3: first candidate that has Q5_K_M, else Q4_K_M, else IQ4_XS within the size limit
    for candidate in candidates[:15]:
        size_label = "unknown size" if candidate["params"] is None else f"{candidate['params'] / 1e9:.1f}B"
        finder_log(f"Checking {candidate['id']} (v{candidate['version']}, {size_label})")
        info = hf_get(f"{HF_URL}/api/models/{candidate['id']}?blobs=true")
        pick = pick_quant(info.get("siblings"), max_bytes) if info else None
        if pick:
            return {"repo_id": candidate["id"], "files": pick["files"], "quant": pick["quant"], "size_bytes": pick["size_bytes"]}
        finder_log("  no fitting quant, trying the next candidate")
    return None

if MODEL_REPO_ID and MODEL_FILENAME:
    repo_id, filenames = MODEL_REPO_ID, [MODEL_FILENAME]
else:
    best = find_best_model()
    if best is None:
        raise RuntimeError("No suitable GGUF model was found. Raise MAX_SIZE_GB, widen the size range, or set MODEL_REPO_ID and MODEL_FILENAME by hand.")
    repo_id, filenames = best["repo_id"], best["files"]
    print(f"Selected model: {repo_id} / {filenames[0]} ({best['quant']}, {best['size_bytes'] / 1024 ** 3:.2f} GB)")

print("Installing the model...")
local_paths = [hf_hub_download(repo_id=repo_id, filename=name) for name in filenames]
model_path = local_paths[0] # split models: the first part is enough, llama.cpp finds the rest next to it
print("Starting up the server...")

ngrok.kill()
public_url = ngrok.connect(8000)

print("" + "="*60)
print(f"API URL (Google Colab): {public_url.public_url}" + "/v1/chat/completions")
print(f"API Key: {API_KEY}")
print("="*60 + "")

os.environ["API_KEY"] = API_KEY

cmd = f"python3 -m llama_cpp.server --model {model_path} --n_gpu_layers -1 --n_ctx {CONTEXT_SIZE} --host 0.0.0.0 --port 8000"

subprocess.run(cmd, shell=True)
```

STEP 4
Connect to Your Web Client
Copy the API Base URL (e.g., https://xxxx.ngrok-free.dev/v1) and API Key printed in the Colab output.
Paste them into the Settings panel of your Web App Client (make sure URL ends with /v1/chat/completions or /v1).