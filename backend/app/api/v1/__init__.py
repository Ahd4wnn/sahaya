from fastapi import APIRouter

from app.api.v1 import (
    admin,
    assistant,
    auth,
    billing,
    documents,
    helpers,
    hirers,
    hires,
    me,
    messages,
    realtime,
    reviews,
    taxonomy,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(taxonomy.router)
api_router.include_router(helpers.router)
api_router.include_router(reviews.router)
api_router.include_router(hires.router)
api_router.include_router(hirers.router)
api_router.include_router(me.router)
api_router.include_router(documents.router)
api_router.include_router(messages.router)
api_router.include_router(assistant.router)
api_router.include_router(billing.router)
api_router.include_router(admin.router)
api_router.include_router(realtime.router)
