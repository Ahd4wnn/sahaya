"""Services (the helper's primary role) and skills (the card chips).

Served to web, Android and iOS from one endpoint so the lists cannot drift.

NOTE ON MALAYALAM: these are best-effort and should be reviewed by a native
speaker before launch. They are shown to helpers who may read Malayalam more
comfortably than English, so getting them right matters more than getting them
fast. Where a term is genuinely ambiguous the English is left to stand alone.
"""

#: (slug, english, malayalam, icon, sort_order)
SERVICES: list[tuple[str, str, str, str, int]] = [
    ("maid", "Maid", "വീട്ടുജോലിക്കാരി", "sparkles", 10),
    ("cook", "Cook", "പാചകക്കാരി", "chef-hat", 20),
    ("home_nurse", "Home Nurse", "ഹോം നഴ്സ്", "stethoscope", 30),
    ("elder_care", "Elder Care", "വയോജന പരിചരണം", "heart-handshake", 40),
    ("child_care", "Child Care", "ശിശുപരിചരണം", "baby", 50),
    ("driver", "Driver", "ഡ്രൈവർ", "car-front", 60),
    ("gardener", "Gardener", "തോട്ടക്കാരൻ", "flower-2", 70),
]

#: The four services the header nav shows on a fresh database, with the Figma
#: frame's own wording. Only applied when a service is first created -- after
#: that, the header is admin-managed and a re-seed must not undo it.
NAV_SERVICES: dict[str, str] = {
    "home_nurse": "Home Nurse",
    "elder_care": "Care Taker",
    "maid": "Household Helps",
    "child_care": "Baby Sitter",
}

#: (slug, english, malayalam, sort_order)
SKILLS: list[tuple[str, str, str, int]] = [
    ("cooking", "Cooking", "പാചകം", 10),
    ("cleaning", "Cleaning", "വൃത്തിയാക്കൽ", 20),
    ("laundry", "Laundry", "അലക്ക്", 30),
    ("ironing", "Ironing", "ഇസ്തിരിയിടൽ", 40),
    ("elder_care", "Elder care", "വയോജന പരിചരണം", 50),
    ("baby_care", "Baby care", "കുഞ്ഞുങ്ങളുടെ പരിചരണം", 60),
    ("patient_care", "Patient care", "രോഗി പരിചരണം", 70),
    ("pet_care", "Pet care", "വളർത്തുമൃഗ പരിചരണം", 80),
    ("gardening", "Gardening", "തോട്ടപരിപാലനം", 90),
    ("driving", "Driving", "ഡ്രൈവിംഗ്", 100),
    ("errands", "Errands & shopping", "പുറംജോലികൾ", 110),
]

#: Plans. Both sides pay the same Rs 99/month -- see docs/DECISIONS.md 002.
PLANS: list[tuple[str, str, str, int]] = [
    (
        "helper_monthly",
        "Helper membership",
        "Stay listed and receive hire requests from families near you.",
        9900,
    ),
    (
        "hirer_monthly",
        "Family membership",
        "Unlock contact details and send unlimited hire requests.",
        9900,
    ),
]
