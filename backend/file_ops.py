import os
import re
import shutil
from pathlib import Path

from backend.utils import split_scenes, join_scenes, word_count, natural_sort_key
from backend.db import get_setting


def get_vault_path() -> Path:
    """Get the configured vault path. Raises ValueError if not set."""
    path_str = get_setting("vault_path")
    if not path_str:
        raise ValueError("Vault path not configured. Run first-run setup.")
    return Path(path_str)


def set_vault_path(path_str: str):
    """Validate and store the vault path."""
    vault = Path(path_str)
    if not vault.exists():
        raise ValueError(f"Path does not exist: {path_str}")
    if not vault.is_dir():
        raise ValueError(f"Path is not a directory: {path_str}")
    has_md = any(p.suffix == ".md" for p in vault.rglob("*.md"))
    if not has_md:
        raise ValueError(f"No .md files found in: {path_str}")
    from backend.db import set_setting
    set_setting("vault_path", str(vault.resolve()))


def is_safe_path(relative_path: str, vault_root: Path) -> Path:
    """Resolve a relative path against the vault root and check for traversal."""
    resolved = (vault_root / relative_path).resolve()
    try:
        resolved.relative_to(vault_root.resolve())
    except ValueError:
        raise ValueError(f"Path traversal detected: {relative_path}")
    return resolved


def _norm_path(path: Path) -> str:
    """Convert a Path to a forward-slash string relative to vault root.

    Critical on Windows where Path uses backslashes.
    """
    return str(path).replace("\\", "/")


def _display_name(filename: str) -> str:
    """Return filename without .md extension for display."""
    if filename.lower().endswith(".md"):
        return filename[:-3]
    return filename


def discover_vault(vault_root: Path):
    """Build the folder/file tree from the vault root.

    Folders appear before files, both sorted with natural sort (numbers first).
    """
    def build_tree(directory: Path):
        items = list(directory.iterdir())

        files = [p for p in items if p.is_file() and p.suffix == ".md"]
        folders = [p for p in items if p.is_dir() and not p.name.startswith(".")]

        files.sort(key=lambda p: natural_sort_key(p.name))
        folders.sort(key=lambda p: natural_sort_key(p.name))

        tree = {
            "name": _display_name(directory.name),
            "path": _norm_path(directory.relative_to(vault_root)),
            "files": [],
            "children": [],
            "word_count": 0,
        }

        # Files
        for item in files:
            content = item.read_text(encoding="utf-8")
            wc = word_count(content)
            rel_path = _norm_path(item.relative_to(vault_root))
            scenes = split_scenes(content)
            tree["files"].append({
                "name": item.name,
                "display_name": _display_name(item.name),
                "path": rel_path,
                "word_count": wc,
                "scene_count": len(scenes),
            })
            tree["word_count"] += wc

        # Subdirectories
        for item in folders:
            child = build_tree(item)
            tree["children"].append(child)
            tree["word_count"] += child["word_count"]

        return tree

    return build_tree(vault_root)


def read_file(relative_path: str, vault_root: Path) -> dict:
    """Read a file and return content, scenes, and metadata."""
    file_path = is_safe_path(relative_path, vault_root)
    content = file_path.read_text(encoding="utf-8")
    scenes = split_scenes(content)
    return {
        "content": content,
        "scenes": scenes,
        "scene_count": len(scenes),
        "total_word_count": word_count(content),
    }


def write_file(relative_path: str, content: str, vault_root: Path):
    """Write content back to the original file, normalizing delimiters."""
    file_path = is_safe_path(relative_path, vault_root)
    scenes = split_scenes(content)
    normalized = join_scenes(scenes)
    file_path.write_text(normalized, encoding="utf-8")


def delete_file(relative_path: str, vault_root: Path):
    """Delete a file from the vault."""
    file_path = is_safe_path(relative_path, vault_root)
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError(f"File not found: {relative_path}")
    print(f"[delete_file] Deleting: {file_path}")
    file_path.unlink()


def _sanitize_filename(name: str) -> str:
    """Strip invalid filename characters. Returns sanitized name with .md extension."""
    # Remove characters not allowed in Windows filenames
    sanitized = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name)
    # Collapse multiple spaces
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()
    # Add .md if missing
    if not sanitized:
        raise ValueError("Filename cannot be empty after sanitization")
    if not sanitized.lower().endswith(".md"):
        sanitized += ".md"
    return sanitized


def create_file(folder_rel_path: str, filename: str, vault_root: Path) -> str:
    """Create a new empty .md file in the specified folder.

    Returns the relative path of the new file (forward slashes).
    """
    folder = is_safe_path(folder_rel_path if folder_rel_path else ".", vault_root)
    if not folder.is_dir():
        raise ValueError(f"Target folder does not exist: {folder_rel_path}")

    safe_filename = _sanitize_filename(filename)

    file_path = folder / safe_filename
    if file_path.exists():
        raise ValueError(f"File already exists: {safe_filename}")

    print(f"[create_file] Creating: {file_path}")
    file_path.write_text("", encoding="utf-8")
    return _norm_path(file_path.relative_to(vault_root))


def rename_file(old_rel_path: str, new_title: str, vault_root: Path) -> str:
    """Rename a file based on a new title. Returns new relative path.

    Strips invalid filename chars, ensures .md extension.
    """
    old_path = is_safe_path(old_rel_path, vault_root)
    if not old_path.exists():
        raise FileNotFoundError(f"File not found: {old_rel_path}")

    new_filename = _sanitize_filename(new_title)
    if new_filename == old_path.name:
        # Same name, nothing to do
        return _norm_path(old_path.relative_to(vault_root))

    new_path = old_path.parent / new_filename
    if new_path.exists():
        raise ValueError(f"A file named '{new_filename}' already exists in this folder")

    print(f"[rename_file] {old_path} -> {new_path}")
    old_path.rename(new_path)
    return _norm_path(new_path.relative_to(vault_root))


def move_file(source_rel_path: str, target_folder_rel_path: str, vault_root: Path) -> str:
    """Move a .md file from one folder to another within the vault.

    Returns the new relative path (forward slashes).
    """
    source = is_safe_path(source_rel_path, vault_root)
    target_folder = is_safe_path(target_folder_rel_path if target_folder_rel_path else ".", vault_root)

    if not source.exists():
        raise FileNotFoundError(f"Source file not found: {source_rel_path}")
    if not target_folder.is_dir():
        raise ValueError(f"Target folder does not exist: {target_folder_rel_path}")

    target = target_folder / source.name
    if target.exists():
        raise ValueError(f"A file with the same name already exists in the target folder")

    print(f"[move_file] {source} -> {target}")
    shutil.move(str(source), str(target))
    return _norm_path(target.relative_to(vault_root))
