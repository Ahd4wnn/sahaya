"""Local-disk storage for development.

Swapping this for S3 is an env var change (STORAGE_BACKEND=s3) -- no application
code moves, which is the whole reason this interface exists.
"""

import asyncio
from pathlib import Path

from app.core.config import settings
from app.providers.storage.base import Storage


class LocalStorage(Storage):
    def __init__(self) -> None:
        self.root = Path(settings.STORAGE_LOCAL_DIR)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Prevent traversal outside the storage root.
        candidate = (self.root / key).resolve()
        root = self.root.resolve()
        if not candidate.is_relative_to(root):
            raise ValueError(f"refusing key outside storage root: {key!r}")
        return candidate

    async def save(self, *, key: str, data: bytes, content_type: str) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
        return key

    async def read(self, *, key: str) -> bytes:
        return await asyncio.to_thread(self._path(key).read_bytes)

    async def delete(self, *, key: str) -> None:
        path = self._path(key)
        if path.exists():
            await asyncio.to_thread(path.unlink)

    def url_for(self, *, key: str) -> str:
        return f"{settings.STORAGE_PUBLIC_BASE.rstrip('/')}/{key}"
