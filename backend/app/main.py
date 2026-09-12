"""Sahaya API."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path, PurePath

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import api_router
from app.core.config import settings
from app.realtime.hub import hub

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Said out loud, every start, while it is on: a reveal that nobody
    # remembers enabling is how it survives into a site with real users.
    if settings.AUTH_TESTING_OTP:
        log = logging.getLogger("sahaya.auth")
        scope = settings.testing_otp_phones
        if settings.testing_otp_expired:
            log.warning(
                "AUTH_TESTING_OTP is set but its end date (%r) has passed, so codes "
                "are NOT being revealed. Remove the setting to tidy up.",
                settings.AUTH_TESTING_OTP_UNTIL,
            )
        else:
            log.warning(
                "AUTH_TESTING_OTP is ON -- login codes are returned over HTTP for %s, "
                "until %s. Anyone who types one of those numbers can sign in as it.",
                ", ".join(scope) if scope else "EVERY NUMBER",
                settings.AUTH_TESTING_OTP_UNTIL.strip() or "NO END DATE -- set "
                "AUTH_TESTING_OTP_UNTIL so this cannot be forgotten",
            )

    # The realtime listener is one long-lived connection per process. It
    # reconnects on its own if the database drops, so a failed first connect
    # does not stop the API from serving REST.
    await hub.start()
    try:
        yield
    finally:
        await hub.stop()


app = FastAPI(
    title="Sahaya API",
    description=(
        "Hire domestic help in Kerala. Flat Rs 99/month for both sides -- "
        "Sahaya never takes a cut of a worker's salary."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.APP_ENV}


class PublicMedia(StaticFiles):
    """Serves uploads -- except anything under `private/`.

    Verification documents are government IDs, stored under that prefix
    (app/api/v1/documents.py). Without this guard the mount below would hand
    one to anyone who guessed its URL. They are read back only through the
    admin endpoint, after a role check.

    The check runs on the path StaticFiles has already normalised, so `..` and
    encoded tricks are collapsed first, and it is case-insensitive because the
    Windows filesystem this develops on is.
    """

    async def get_response(self, path: str, scope):
        parts = PurePath(path).parts
        if parts and parts[0].lower() == "private":
            raise StarletteHTTPException(status_code=404)
        return await super().get_response(path, scope)


# Serve uploaded photos in development. In production these live in S3 behind
# CloudFront, and this mount simply is not used.
if settings.STORAGE_BACKEND == "local":
    media_root = Path(settings.STORAGE_LOCAL_DIR)
    media_root.mkdir(parents=True, exist_ok=True)
    app.mount("/media", PublicMedia(directory=media_root), name="media")
