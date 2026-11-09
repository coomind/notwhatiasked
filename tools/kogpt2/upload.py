"""
convert.py 결과 폴더를 Hugging Face 에 올린다. 토큰은 환경변수 HF_TOKEN(없으면 Windows 사용자 환경변수에서 읽음).
  python tools/kogpt2/upload.py <작업폴더> [저장소 id, 기본 coomind/kogpt2-base-v2-onnx]
"""
import os
import sys
from pathlib import Path

from huggingface_hub import HfApi

token = os.environ.get("HF_TOKEN")
if not token and os.name == "nt":
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
        token = winreg.QueryValueEx(k, "HF_TOKEN")[0]
if not token:
    sys.exit("HF_TOKEN 없음")

repo_dir = Path(sys.argv[1]) / "repo"
repo_id = sys.argv[2] if len(sys.argv) > 2 else "coomind/kogpt2-base-v2-onnx"
api = HfApi(token=token)
api.create_repo(repo_id, repo_type="model", exist_ok=True, private=False)
api.upload_folder(folder_path=str(repo_dir), repo_id=repo_id, repo_type="model", commit_message="KoGPT2 ONNX q8 for Transformers.js")
print("uploaded:", f"https://huggingface.co/{repo_id}")
