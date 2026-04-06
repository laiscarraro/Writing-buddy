"""Pydantic models for API request/response schemas."""
from pydantic import BaseModel


class FileContent(BaseModel):
    """Request body for saving file content."""
    content: str


class VaultConfig(BaseModel):
    """Request body for first-run vault configuration."""
    vault_path: str


class NewFile(BaseModel):
    """Request body for creating a new file."""
    folder_path: str
    filename: str


class MoveFile(BaseModel):
    """Request body for moving a file between folders."""
    source_path: str
    target_folder: str


class RenameFile(BaseModel):
    """Request body for renaming a file via its title."""
    path: str
    new_title: str


class FileResponse(BaseModel):
    """Response model for a loaded file."""
    content: str
    scenes: list[str]
    scene_count: int
    total_word_count: int
