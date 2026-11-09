"""
KoGPT2(skt/kogpt2-base-v2, CC BY-NC-SA 4.0) → 브라우저(transformers.js)용 ONNX q8 폴더.
  python tools/kogpt2/convert.py <작업폴더>
결과: <작업폴더>/repo/ (config.json, generation_config.json, tokenizer.json, tokenizer_config.json, onnx/model_quantized.onnx, README.md)
업로드는 tools/kogpt2/upload.py 가 한다(토큰은 환경변수 HF_TOKEN).
"""
import json
import os
import shutil
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download
from onnxruntime.quantization import QuantType, quantize_dynamic
from optimum.exporters.onnx import main_export

SRC = "skt/kogpt2-base-v2"
work = Path(sys.argv[1])
export_dir = work / "export"
repo = work / "repo"
(repo / "onnx").mkdir(parents=True, exist_ok=True)

# 1) ONNX 내보내기(과거 키·값 캐시 포함 = 빠른 이어쓰기)
if not any(export_dir.glob("*.onnx")):
    main_export(SRC, output=export_dir, task="text-generation-with-past", opset=14)
onnx_files = sorted(p.name for p in export_dir.glob("*.onnx"))
print("exported:", onnx_files)
src_onnx = export_dir / ("decoder_model_merged.onnx" if "decoder_model_merged.onnx" in onnx_files else "model.onnx")

# 2) 8비트 동적 양자화(transformers.js 의 dtype 'q8' = *_quantized.onnx)
dst = repo / "onnx" / "model_quantized.onnx"
quantize_dynamic(str(src_onnx), str(dst), weight_type=QuantType.QUInt8, per_channel=False, reduce_range=False)
print("quantized:", dst, round(dst.stat().st_size / 1048576, 1), "MB")

# 3) 설정·토크나이저
cfg = json.loads((export_dir / "config.json").read_text(encoding="utf-8"))
cfg.pop("task_specific_params", None)  # 원본은 do_sample:true(무작위). 게임은 탐욕 디코딩으로 고정
(repo / "config.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
gen = {"bos_token_id": 0, "eos_token_id": 1, "pad_token_id": 3, "do_sample": False, "max_new_tokens": 25}
(repo / "generation_config.json").write_text(json.dumps(gen, indent=2), encoding="utf-8")
shutil.copy(hf_hub_download(SRC, "tokenizer.json"), repo / "tokenizer.json")
# 원본 저장소엔 tokenizer_config.json 이 없다. 특수 토큰은 SKT-AI/KoGPT2 README 의 예시 그대로
tok_cfg = {
    "tokenizer_class": "PreTrainedTokenizerFast",
    "bos_token": "</s>", "eos_token": "</s>", "unk_token": "<unk>", "pad_token": "<pad>", "mask_token": "<mask>",
    "model_max_length": 1024,
    "model_input_names": ["input_ids", "attention_mask"],
}
(repo / "tokenizer_config.json").write_text(json.dumps(tok_cfg, ensure_ascii=False, indent=2), encoding="utf-8")

(repo / "README.md").write_text("""---
language: ko
license: cc-by-nc-sa-4.0
library_name: transformers.js
base_model: skt/kogpt2-base-v2
pipeline_tag: text-generation
tags:
- gpt2
- onnx
---

# KoGPT2 (skt/kogpt2-base-v2) — ONNX q8 for Transformers.js

This is an ONNX export of **[skt/kogpt2-base-v2](https://huggingface.co/skt/kogpt2-base-v2)** by **SK Telecom**
([SKT-AI/KoGPT2](https://github.com/SKT-AI/KoGPT2)), dynamically quantized to 8 bits so it can run in a web browser
with [Transformers.js](https://github.com/huggingface/transformers.js).

- Changes: ONNX export (with past key values) via Hugging Face Optimum, 8-bit dynamic quantization (ONNX Runtime),
  added `tokenizer_config.json` (special tokens as documented in the original README), removed the sampling default
  from `config.json` (`generation_config.json` uses greedy decoding). Weights are otherwise unchanged.
- License: **CC BY-NC-SA 4.0**, same as the original model. Non-commercial use only. Attribution: SK Telecom, KoGPT2.
- Used by the browser game “아니 그거 말고 / Not What I Asked” (https://notwhatiasked.pages.dev).

원본: SK텔레콤 KoGPT2(skt/kogpt2-base-v2). 라이선스 CC BY-NC-SA 4.0(비상업). 이 저장소는 브라우저에서 돌리기 위해
ONNX로 바꾸고 8비트 양자화한 것 외에는 원본과 같습니다.
""", encoding="utf-8")
print("repo files:", sorted(str(p.relative_to(repo)) for p in repo.rglob("*") if p.is_file()))
