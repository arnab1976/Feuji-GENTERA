"""
Repo-root ASGI entry for Render / Docker when the working directory is the monorepo root.
Loads backend/main.py explicitly to avoid circular import with this file's own name (main).
"""
from __future__ import annotations

import importlib.util
import os
import sys

_ROOT = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(_ROOT, "backend")

if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

_backend_main = os.path.join(_BACKEND, "main.py")
if not os.path.isfile(_backend_main):
    raise ImportError(
        f"backend/main.py not found at {_backend_main}. "
        "If the image only contains the backend package, run: uvicorn main:app"
    )

_spec = importlib.util.spec_from_file_location("feuji_backend_main", _backend_main)
if _spec is None or _spec.loader is None:
    raise ImportError(f"Unable to load {_backend_main}")

_mod = importlib.util.module_from_spec(_spec)
# Register before exec so backend relative imports and FastAPI lifespan behave normally
sys.modules["feuji_backend_main"] = _mod
_spec.loader.exec_module(_mod)

app = _mod.app
