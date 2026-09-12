"""Background removal via rembg (ONNX, runs locally, no Docker, no API calls)."""

import asyncio
import logging

from app.providers.imaging.base import CutoutResult, Imaging

logger = logging.getLogger("sahaya.imaging")


class RembgImaging(Imaging):
    """Lazily loads the u2net session on first use.

    Loading costs a few seconds and ~180MB of model, so it must not happen at
    import time -- that would make every `alembic` or test run pay for it.
    """

    _session = None

    @classmethod
    def _get_session(cls):
        if cls._session is None:
            from rembg import new_session

            cls._session = new_session("u2net")
        return cls._session

    async def cutout(self, data: bytes) -> CutoutResult:
        try:
            normalized = await asyncio.to_thread(self.normalize, data)
        except Exception as exc:
            logger.warning("portrait normalize failed: %s", exc)
            return CutoutResult(ok=False, reason=f"unreadable image: {exc}")

        try:
            result = await asyncio.to_thread(self._remove, normalized)
        except Exception as exc:
            logger.warning("rembg failed: %s", exc)
            return CutoutResult(ok=False, reason=f"segmentation failed: {exc}")

        plausible, why = self.alpha_is_plausible(result)
        if not plausible:
            return CutoutResult(ok=False, reason=why)

        # Checked on the full frame, then framed: the plausibility test is
        # about how much was removed, and cropping first would flatter it.
        try:
            result = await asyncio.to_thread(self.frame_subject, result)
        except Exception as exc:
            # A cutout that cannot be framed is still a usable cutout.
            logger.warning("portrait framing failed, keeping the full frame: %s", exc)

        return CutoutResult(ok=True, data=result)

    def _remove(self, data: bytes) -> bytes:
        from rembg import remove

        return remove(data, session=self._get_session())
