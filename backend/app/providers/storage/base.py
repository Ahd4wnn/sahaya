"""Blob storage interface -- photos, cutouts, verification documents."""

from abc import ABC, abstractmethod


class Storage(ABC):
    @abstractmethod
    async def save(self, *, key: str, data: bytes, content_type: str) -> str:
        """Persist bytes under `key`. Returns the key actually written."""

    @abstractmethod
    async def read(self, *, key: str) -> bytes: ...

    @abstractmethod
    async def delete(self, *, key: str) -> None: ...

    @abstractmethod
    def url_for(self, *, key: str) -> str:
        """Public URL for a stored object."""
