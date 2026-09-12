"""Verification documents -- the input to the admin verification queue.

These are government IDs. They are stored under the `private/` key prefix,
which the public /media mount refuses to serve (see app/main.py), and the only
way to read one back is the admin endpoint that streams it after checking the
caller's role. A document URL that works for anyone who guesses it would be a
far worse failure than any bug in the queue itself.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.enums import DocumentKind, DocumentStatus, UserRole, VerificationStatus
from app.models.marketplace import Document, HelperProfile
from app.providers.registry import get_storage

router = APIRouter(tags=["documents"])

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

#: Content type -> stored extension. PDF is allowed because police certificates
#: in Kerala are routinely issued as PDFs.
ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
}

UPLOADABLE = {
    DocumentKind.ID_PROOF,
    DocumentKind.ADDRESS_PROOF,
    DocumentKind.POLICE_VERIFICATION,
}

#: Which card badge a document kind feeds.
BADGE_FIELD = {
    DocumentKind.ID_PROOF: "id_verification_status",
    DocumentKind.POLICE_VERIFICATION: "police_verification_status",
}


class DocumentOut(BaseModel):
    id: uuid.UUID
    kind: DocumentKind
    status: DocumentStatus
    review_note: str
    created_at: datetime


def document_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        kind=doc.kind,
        status=doc.status,
        review_note=doc.review_note,
        created_at=doc.created_at,
    )


@router.post(
    "/me/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED
)
async def upload_document(
    user: CurrentUser,
    db: DbSession,
    kind: DocumentKind = Form(...),
    file: UploadFile = File(...),
) -> DocumentOut:
    if user.role is not UserRole.HELPER:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only helpers upload verification documents."
        )
    if kind not in UPLOADABLE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That document type is not accepted.")

    extension = ALLOWED_TYPES.get(file.content_type or "")
    if extension is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPEG, PNG, WebP or PDF."
        )
    raw = await file.read()
    if len(raw) > MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Keep the file under 10 MB."
        )

    key = f"private/documents/{user.id}/{uuid.uuid4().hex}.{extension}"
    await get_storage().save(key=key, data=raw, content_type=file.content_type)

    doc = Document(user_id=user.id, kind=kind, storage_key=key)
    db.add(doc)

    field = BADGE_FIELD.get(kind)
    if field:
        profile = (
            await db.execute(select(HelperProfile).where(HelperProfile.user_id == user.id))
        ).scalar_one_or_none()
        # A new upload never downgrades a badge already earned; it only moves
        # an unverified or rejected helper into the queue.
        if profile and getattr(profile, field) is not VerificationStatus.VERIFIED:
            setattr(profile, field, VerificationStatus.PENDING)

    await db.flush()
    await db.refresh(doc)
    return document_out(doc)


@router.get("/me/documents", response_model=list[DocumentOut])
async def my_documents(user: CurrentUser, db: DbSession) -> list[DocumentOut]:
    rows = (
        await db.execute(
            select(Document)
            .where(Document.user_id == user.id)
            .order_by(Document.created_at.desc())
        )
    ).scalars().all()
    return [document_out(d) for d in rows]
