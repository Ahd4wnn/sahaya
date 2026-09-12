"""Writing notifications -- the content of the pinned "Sahaya" thread in chat.

Every place that tells someone something goes through `notify()`, so the
person's notification preferences are honoured in exactly one place.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.engagement import Notification
from app.models.user import User
from app.services.events import publish

#: What a new account gets. Keys are *categories*, not kinds, and are stored
#: sparse on the user row -- a missing key means this default, so adding a
#: category later needs no backfill.
DEFAULT_PREFS: dict[str, bool] = {
    "hire_requests": True,
    "reviews": True,
    "verification": True,
    "tips": False,
}

#: Kinds that ignore preferences. Nobody should be able to switch off being
#: told their membership lapsed or their account changed -- those change what
#: they are able to do on the platform.
ALWAYS_ON = frozenset({"billing", "account"})

#: Which preference controls which notification kind.
KIND_CATEGORY: dict[str, str] = {
    "hire_request": "hire_requests",
    "review": "reviews",
    "verification": "verification",
    "profile": "tips",
}


def effective_prefs(user: User) -> dict[str, bool]:
    return {**DEFAULT_PREFS, **(user.notification_prefs or {})}


async def notify(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str = "",
    link: str = "",
) -> Notification | None:
    """Queue one notification, unless the person has switched that kind off.

    Returns None when suppressed, so callers never need to know about
    preferences at all.
    """
    user = await db.get(User, user_id)
    if user is None:
        return None

    if kind not in ALWAYS_ON:
        category = KIND_CATEGORY.get(kind)
        if category and not effective_prefs(user).get(category, True):
            return None

    row = Notification(
        user_id=user_id,
        kind=kind,
        title=title[:160],
        body=body,
        link=link[:300],
    )
    db.add(row)
    # Lights the badge and the Sahaya thread without waiting for a poll.
    # Sent only if the surrounding transaction commits.
    await publish(
        db, to=[user_id], type="notification", data={"kind": kind, "title": row.title}
    )
    return row
