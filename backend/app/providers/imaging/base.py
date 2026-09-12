"""Portrait processing for the helper card.

The card's signature look is a cut-out portrait breaking above the header panel.
Helpers upload photos taken in poor light against busy backgrounds, so this
interface is built around the assumption that segmentation will sometimes fail
and that failing must never block a helper from listing.
"""

import io
from abc import ABC, abstractmethod
from dataclasses import dataclass

from PIL import Image, ImageOps

#: Longest edge of a stored portrait. Large enough for a retina card, small
#: enough that a browse grid of 24 cards is not megabytes of images.
MAX_EDGE = 1024

#: Side of a framed cutout. The card draws it at 145px, so this is comfortable
#: at 2x and still a small file.
PORTRAIT_EDGE = 420

#: Headroom above the head, as a share of the subject's width. Without it the
#: hair is flush against the top edge, which reads as a mis-crop.
HEADROOM = 0.10

#: Breathing room at the sides, same units.
SIDE_MARGIN = 0.06

#: Alpha at or below this is background. Matches alpha_is_plausible.
OPAQUE_ABOVE = 8


@dataclass(frozen=True)
class CutoutResult:
    ok: bool
    data: bytes | None = None
    reason: str = ""


class Imaging(ABC):
    @abstractmethod
    async def cutout(self, data: bytes) -> CutoutResult:
        """Segment the subject onto transparency. Never raises -- returns
        ``CutoutResult(ok=False, reason=...)`` instead, because a failed cutout
        is a render decision (circular crop fallback), not an error."""

    @staticmethod
    def normalize(data: bytes) -> bytes:
        """Apply EXIF rotation, downscale, and re-encode as PNG.

        EXIF rotation matters more than it sounds: phone cameras record
        orientation as metadata, and a portrait that arrives sideways on the
        card is the single most visible upload bug.
        """
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGBA")
            image.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            buffer = io.BytesIO()
            image.save(buffer, format="PNG", optimize=True)
            return buffer.getvalue()

    @staticmethod
    def frame_subject(data: bytes) -> bytes:
        """Crop a cutout to the person, square, anchored at the top of the head.

        Segmentation returns the camera's framing with the background erased,
        so a portrait taken at arm's length leaves the subject somewhere in the
        middle of a mostly empty image. The card then shows that emptiness.

        The crop is as wide as the subject plus a margin, and square, so it
        holds head and shoulders -- which is what the card's 145px box and its
        `object-top` were designed around. Square also means the card never
        crops it a second time, at any width.

        Padding, not clamping, when the subject touches an edge: clamping would
        shift the head off-centre, and transparent pixels cost nothing.
        """
        with Image.open(io.BytesIO(data)) as image:
            image = image.convert("RGBA")
            mask = image.getchannel("A").point(lambda a: 255 if a > OPAQUE_ABOVE else 0)
            box = mask.getbbox()
            if box is None:
                return data  # nothing opaque; leave it to alpha_is_plausible

            left, top, right, bottom = box
            width = right - left
            side = round(width * (1 + 2 * SIDE_MARGIN))
            # A very wide subject (arms out) would give a square taller than the
            # person; a very narrow one would crop into the face. Keep the side
            # between the subject's width and its height.
            side = max(width, min(side, bottom - top))

            centre = (left + right) / 2
            crop_left = round(centre - side / 2)
            crop_top = round(top - width * HEADROOM)

            framed = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            framed.paste(image, (-crop_left, -crop_top))
            if side != PORTRAIT_EDGE:
                framed = framed.resize(
                    (PORTRAIT_EDGE, PORTRAIT_EDGE), Image.LANCZOS
                )

            buffer = io.BytesIO()
            framed.save(buffer, format="PNG", optimize=True)
            return buffer.getvalue()

    @staticmethod
    def alpha_is_plausible(data: bytes) -> tuple[bool, str]:
        """Sanity-check a segmentation result.

        rembg returns an image whatever happens, so "it did not raise" is not
        evidence it worked. Two failure shapes are worth catching:

        - almost nothing was removed (background kept) -- the portrait will not
          read as cut out, it will just look like a rectangle with soft edges
        - almost everything was removed -- we would render a ghost

        Anything outside 8-92% transparency is treated as a failure and falls
        back to the circular crop.
        """
        with Image.open(io.BytesIO(data)) as image:
            if image.mode != "RGBA":
                return False, "result has no alpha channel"
            alpha = image.getchannel("A")
            histogram = alpha.histogram()
            total = sum(histogram)
            if not total:
                return False, "empty image"
            transparent = sum(histogram[:16])
            share = transparent / total

        if share < 0.08:
            return False, f"almost nothing removed ({share:.0%} transparent)"
        if share > 0.92:
            return False, f"almost everything removed ({share:.0%} transparent)"
        return True, ""
