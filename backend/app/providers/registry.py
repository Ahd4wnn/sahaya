"""Provider selection.

The five env vars read here are the entire local-to-AWS migration surface.
Resolved once at import; every consumer takes a provider through these getters
rather than constructing one.
"""

from functools import lru_cache

from app.core.config import settings
from app.providers.email.base import EmailSender
from app.providers.imaging.base import Imaging
from app.providers.llm.base import Llm
from app.providers.sms.base import SmsSender
from app.providers.storage.base import Storage


@lru_cache
def get_email_sender() -> EmailSender:
    if settings.EMAIL_BACKEND == "smtp":
        from app.providers.email.smtp import SmtpEmailSender

        return SmtpEmailSender()
    from app.providers.email.console import ConsoleEmailSender

    return ConsoleEmailSender()


@lru_cache
def get_sms_sender() -> SmsSender:
    if settings.SMS_BACKEND == "msg91":
        from app.providers.sms.msg91 import Msg91SmsSender

        return Msg91SmsSender()
    from app.providers.sms.console import ConsoleSmsSender

    return ConsoleSmsSender()


@lru_cache
def get_storage() -> Storage:
    if settings.STORAGE_BACKEND == "s3":
        raise NotImplementedError(
            "S3 storage is not implemented yet. Keep STORAGE_BACKEND=local, or "
            "add app/providers/storage/s3.py implementing the Storage interface."
        )
    from app.providers.storage.local import LocalStorage

    return LocalStorage()


@lru_cache
def get_imaging() -> Imaging:
    if settings.IMAGING_BACKEND == "rembg":
        from app.providers.imaging.rembg_impl import RembgImaging

        return RembgImaging()
    from app.providers.imaging.noop import NoopImaging

    return NoopImaging()


@lru_cache
def get_llm() -> Llm:
    """The assistant's model.

    Unlike the others this one can legitimately come back switched off: with no
    OPENAI_API_KEY the OpenAI provider reports `available = False`, and every
    surface checks that before offering Ask Sahaya at all.
    """
    if settings.ASSISTANT_BACKEND == "openai":
        from app.providers.llm.openai_impl import OpenAiLlm

        return OpenAiLlm()
    from app.providers.llm.disabled import DisabledLlm

    return DisabledLlm()
