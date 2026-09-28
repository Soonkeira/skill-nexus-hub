import os
import shutil
import uuid

import aiofiles

from app.config import settings


def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


async def save_skill_zip(skill_id: uuid.UUID, version_id: uuid.UUID, content: bytes) -> str:
    dir_path = os.path.join(settings.data_dir, str(skill_id))
    _ensure_dir(dir_path)
    file_path = os.path.join(dir_path, f"{version_id}.zip")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)
    return file_path


async def save_icon(skill_id: uuid.UUID, content: bytes, filename: str) -> str:
    dir_path = os.path.join(settings.data_dir, "icons")
    _ensure_dir(dir_path)
    ext = os.path.splitext(filename)[1] or ".png"
    file_path = os.path.join(dir_path, f"{skill_id}{ext}")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)
    return file_path


CHUNK_SIZE = 1024 * 1024  # 1 MB per chunk for streaming


def _resolve_within_data_dir(path: str) -> str:
    """Resolve a path and verify it stays inside DATA_DIR (path-traversal guard)."""
    real_path = os.path.realpath(path)
    real_data_dir = os.path.realpath(settings.data_dir)
    if real_path != real_data_dir and not real_path.startswith(real_data_dir + os.sep):
        raise ValueError("Path traversal detected")
    return real_path


async def read_file(path: str) -> bytes:
    real_path = _resolve_within_data_dir(path)
    async with aiofiles.open(real_path, "rb") as f:
        return await f.read()


async def stream_file(path: str, chunk_size: int = CHUNK_SIZE):
    """Yield file contents in chunks for streaming downloads.

    Streams from disk instead of loading the whole file into memory, which
    keeps peak memory bounded under concurrent large downloads (OOM guard).
    """
    real_path = _resolve_within_data_dir(path)
    async with aiofiles.open(real_path, "rb") as f:
        while True:
            chunk = await f.read(chunk_size)
            if not chunk:
                break
            yield chunk


def file_size(path: str) -> int:
    """Return file size in bytes (0 if missing)."""
    try:
        return os.path.getsize(_resolve_within_data_dir(path))
    except OSError:
        return 0


async def delete_file(path: str):
    if os.path.exists(path):
        os.remove(path)


async def delete_skill_dir(skill_id: uuid.UUID):
    dir_path = os.path.join(settings.data_dir, str(skill_id))
    real_path = os.path.realpath(dir_path)
    real_data_dir = os.path.realpath(settings.data_dir)
    if real_path.startswith(real_data_dir) and os.path.isdir(real_path):
        shutil.rmtree(real_path)
