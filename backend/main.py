from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse as StaticFileResponse

from backend.db import init_db, get_setting, set_setting
from backend.file_ops import (
    get_vault_path, set_vault_path, discover_vault,
    read_file, write_file, delete_file, create_file, move_file, rename_file,
)
from backend.models import VaultConfig, FileContent, NewFile, MoveFile, RenameFile, FileResponse
from contextlib import asynccontextmanager
import os

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Writing Buddy", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
app.mount("/pages", StaticFiles(directory=os.path.join(FRONTEND_DIR, "pages")), name="pages")


@app.get("/")
def serve_index():
    return StaticFileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# ---- Settings / First-Run ----

@app.get("/api/config")
def get_config():
    vault = get_setting("vault_path")
    return {"configured": vault is not None, "vault_path": vault}

@app.post("/api/config/vault")
def configure_vault(config: VaultConfig):
    try:
        set_vault_path(config.vault_path)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ---- Vault Tree ----

@app.get("/api/vault/tree")
def vault_tree():
    try:
        vault = get_vault_path()
    except ValueError:
        raise HTTPException(status_code=400, detail="Vault not configured")
    return discover_vault(vault)

# ---- File Management (must come before catch-all /api/file/{path} routes) ----

@app.post("/api/file/create")
def create_new_file(body: NewFile):
    try:
        vault = get_vault_path()
    except ValueError:
        raise HTTPException(status_code=400, detail="Vault not configured")
    try:
        rel_path = create_file(body.folder_path, body.filename, vault)
        return {"ok": True, "path": rel_path}
    except (ValueError, OSError) as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/file/move")
def move_existing_file(body: MoveFile):
    try:
        vault = get_vault_path()
    except ValueError:
        raise HTTPException(status_code=400, detail="Vault not configured")
    try:
        new_path = move_file(body.source_path, body.target_folder, vault)
        return {"ok": True, "path": new_path}
    except (ValueError, FileNotFoundError, OSError) as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/file/rename")
def rename_existing_file(body: RenameFile):
    """Rename a file based on a new title. Adds .md extension automatically."""
    try:
        vault = get_vault_path()
    except ValueError:
        raise HTTPException(status_code=400, detail="Vault not configured")
    try:
        new_path = rename_file(body.path, body.new_title, vault)
        return {"ok": True, "path": new_path}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=str(e))

# ---- File Content (catch-all with {path}) ----

@app.get("/api/file/{path:path}")
def load_file(path: str):
    try:
        vault = get_vault_path()
    except ValueError:
        raise HTTPException(status_code=400, detail="Vault not configured")
    try:
        data = read_file(path, vault)
        return FileResponse(**data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")

@app.post("/api/file/{path:path}")
def save_file(path: str, body: FileContent):
    try:
        vault = get_vault_path()
    except ValueError:
        raise HTTPException(status_code=400, detail="Vault not configured")
    try:
        write_file(path, body.content, vault)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/file/{path:path}")
def delete_existing_file(path: str):
    """Delete a file from the vault."""
    try:
        vault = get_vault_path()
    except ValueError:
        raise HTTPException(status_code=400, detail="Vault not configured")
    try:
        delete_file(path, vault)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=str(e))
