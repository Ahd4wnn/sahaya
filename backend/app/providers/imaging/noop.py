"""Imaging backend that never cuts out.

Used when rembg is unavailable or deliberately disabled. Every helper then
renders with the circular-crop fallback, which is a complete and correct card --
just less striking. Nothing breaks.
"""

import asyncio

from app.providers.imaging.base import CutoutResult, Imaging


class NoopImaging(Imaging):
    async def cutout(self, data: bytes) -> CutoutResult:
        try:
            await asyncio.to_thread(self.normalize, data)
        except Exception as exc:
            return CutoutResult(ok=False, reason=f"unreadable image: {exc}")
        return CutoutResult(ok=False, reason="cutout disabled (noop backend)")
