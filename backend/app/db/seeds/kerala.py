"""Kerala geography: 14 districts and the towns where domestic hiring concentrates.

Town density is deliberately uneven and follows demand rather than administrative
tidiness -- Ernakulam, Thiruvananthapuram and Kozhikode carry the most entries
because that is where the hiring is.

NOTE ON MALAYALAM: district names below are standard and reliable. Town-level
Malayalam is left blank rather than guessed, because a wrong place name in a
user's own language is worse than none. A Malayalam speaker should fill these in
-- the column exists and the UI already renders it when present.
"""

#: (slug, english, malayalam)
DISTRICTS: list[tuple[str, str, str]] = [
    ("thiruvananthapuram", "Thiruvananthapuram", "തിരുവനന്തപുരം"),
    ("kollam", "Kollam", "കൊല്ലം"),
    ("pathanamthitta", "Pathanamthitta", "പത്തനംതിട്ട"),
    ("alappuzha", "Alappuzha", "ആലപ്പുഴ"),
    ("kottayam", "Kottayam", "കോട്ടയം"),
    ("idukki", "Idukki", "ഇടുക്കി"),
    ("ernakulam", "Ernakulam", "എറണാകുളം"),
    ("thrissur", "Thrissur", "തൃശ്ശൂർ"),
    ("palakkad", "Palakkad", "പാലക്കാട്"),
    ("malappuram", "Malappuram", "മലപ്പുറം"),
    ("kozhikode", "Kozhikode", "കോഴിക്കോട്"),
    ("wayanad", "Wayanad", "വയനാട്"),
    ("kannur", "Kannur", "കണ്ണൂർ"),
    ("kasaragod", "Kasaragod", "കാസർഗോഡ്"),
]

#: district_slug -> list of (town_name, is_major)
#: is_major marks the towns shown before the "Show all" fold in the filter.
TOWNS: dict[str, list[tuple[str, bool]]] = {
    "thiruvananthapuram": [
        ("Thiruvananthapuram City", True),
        ("Kazhakoottam", True),
        ("Technopark", True),
        ("Neyyattinkara", True),
        ("Attingal", True),
        ("Nedumangad", False),
        ("Varkala", False),
        ("Kovalam", False),
        ("Balaramapuram", False),
        ("Vattiyoorkavu", False),
        ("Pothencode", False),
        ("Kattakada", False),
    ],
    "kollam": [
        ("Kollam City", True),
        ("Karunagappally", True),
        ("Kottarakkara", True),
        ("Punalur", True),
        ("Paravur", False),
        ("Chavara", False),
        ("Anchal", False),
        ("Kundara", False),
        ("Chathannoor", False),
    ],
    "pathanamthitta": [
        ("Pathanamthitta Town", True),
        ("Thiruvalla", True),
        ("Adoor", True),
        ("Pandalam", False),
        ("Ranni", False),
        ("Konni", False),
        ("Mallappally", False),
        ("Kozhencherry", False),
    ],
    "alappuzha": [
        ("Alappuzha Town", True),
        ("Cherthala", True),
        ("Kayamkulam", True),
        ("Mavelikkara", False),
        ("Chengannur", False),
        ("Haripad", False),
        ("Ambalappuzha", False),
        ("Aroor", False),
    ],
    "kottayam": [
        ("Kottayam Town", True),
        ("Changanassery", True),
        ("Pala", True),
        ("Ettumanoor", False),
        ("Vaikom", False),
        ("Kanjirappally", False),
        ("Erattupetta", False),
        ("Kaduthuruthy", False),
    ],
    "idukki": [
        ("Thodupuzha", True),
        ("Kattappana", True),
        ("Munnar", True),
        ("Adimali", False),
        ("Painavu", False),
        ("Nedumkandam", False),
        ("Kumily", False),
        ("Vandiperiyar", False),
    ],
    "ernakulam": [
        ("Kochi", True),
        ("Ernakulam Town", True),
        ("Kakkanad", True),
        ("Edappally", True),
        ("Aluva", True),
        ("Kalamassery", True),
        ("Thrippunithura", True),
        ("Perumbavoor", False),
        ("Vyttila", False),
        ("Palarivattom", False),
        ("Fort Kochi", False),
        ("Angamaly", False),
        ("Muvattupuzha", False),
        ("Kothamangalam", False),
        ("North Paravur", False),
        ("Piravom", False),
        ("Cherai", False),
        ("Maradu", False),
    ],
    "thrissur": [
        ("Thrissur City", True),
        ("Chalakudy", True),
        ("Irinjalakuda", True),
        ("Guruvayur", True),
        ("Kodungallur", False),
        ("Kunnamkulam", False),
        ("Wadakkanchery", False),
        ("Chavakkad", False),
        ("Ollur", False),
    ],
    "palakkad": [
        ("Palakkad Town", True),
        ("Ottapalam", True),
        ("Shoranur", True),
        ("Chittur", False),
        ("Mannarkkad", False),
        ("Pattambi", False),
        ("Alathur", False),
        ("Cherpulassery", False),
    ],
    "malappuram": [
        ("Malappuram Town", True),
        ("Manjeri", True),
        ("Perinthalmanna", True),
        ("Tirur", True),
        ("Ponnani", False),
        ("Kottakkal", False),
        ("Nilambur", False),
        ("Edappal", False),
        ("Tanur", False),
        ("Parappanangadi", False),
    ],
    "kozhikode": [
        ("Kozhikode City", True),
        ("Vadakara", True),
        ("Koyilandy", True),
        ("Feroke", True),
        ("Ramanattukara", False),
        ("Mukkam", False),
        ("Beypore", False),
        ("Balussery", False),
        ("Thamarassery", False),
        ("Kunnamangalam", False),
    ],
    "wayanad": [
        ("Kalpetta", True),
        ("Sulthan Bathery", True),
        ("Mananthavady", True),
        ("Meppadi", False),
        ("Panamaram", False),
        ("Vythiri", False),
    ],
    "kannur": [
        ("Kannur City", True),
        ("Thalassery", True),
        ("Payyanur", True),
        ("Taliparamba", False),
        ("Mattannur", False),
        ("Iritty", False),
        ("Kuthuparamba", False),
        ("Azhikode", False),
    ],
    "kasaragod": [
        ("Kasaragod Town", True),
        ("Kanhangad", True),
        ("Nileshwaram", False),
        ("Uppala", False),
        ("Bekal", False),
        ("Manjeshwaram", False),
    ],
}


def town_slug(district_slug: str, name: str) -> str:
    base = name.lower().replace(" ", "-").replace(".", "")
    return f"{district_slug}-{base}"
