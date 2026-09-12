"""Demo helper profiles, so browse has real content during development.

Every row is marked with a `demo-` phone prefix and can be removed wholesale
with `python -m app.db.seed_demo --clear`.

Wages are in paise and reflect realistic Kerala monthly rates for domestic work
as of 2026 -- a part-time cleaner in a small town sits near the bottom of the
range and a live-in home nurse in Kochi near the top. Getting this roughly right
matters: the wage filter is unusable if every demo profile asks for the same
amount.
"""

#: name, service, skills, district, town, exp yrs, wage min/max (paise),
#: shifts, hours, live-in, languages, headline
DEMO_HELPERS = [
    (
        "Fathima Nida T", "home_nurse", ["patient_care", "elder_care", "cooking"],
        "ernakulam", "ernakulam-kakkanad", 6, 1_800_000, 2_400_000,
        ["full_day"], 10, True, ["Malayalam", "English", "Hindi"],
        "Trained home nurse, comfortable with post-surgery care",
    ),
    (
        "Sujatha Menon", "cook", ["cooking", "cleaning"],
        "ernakulam", "ernakulam-edappally", 12, 1_400_000, 1_800_000,
        ["morning", "evening"], 6, False, ["Malayalam", "Tamil"],
        "Kerala and South Indian cooking, 12 years in family homes",
    ),
    (
        "Beena Thomas", "maid", ["cleaning", "laundry", "ironing"],
        "thiruvananthapuram", "thiruvananthapuram-kazhakoottam", 4, 900_000, 1_200_000,
        ["morning"], 4, False, ["Malayalam"],
        "Reliable morning help for cleaning and laundry",
    ),
    (
        "Rajesh Kumar", "driver", ["driving", "errands"],
        "ernakulam", "ernakulam-kochi", 9, 1_600_000, 2_000_000,
        ["full_day"], 9, False, ["Malayalam", "Hindi", "English"],
        "Licensed since 2017, city and long-distance",
    ),
    (
        "Shylaja Devi", "elder_care", ["elder_care", "patient_care", "cooking"],
        "kottayam", "kottayam-kottayam-town", 8, 1_500_000, 1_900_000,
        ["full_day"], 12, True, ["Malayalam"],
        "Live-in companion and carer for elderly parents",
    ),
    (
        "Anitha Joseph", "child_care", ["baby_care", "cooking", "cleaning"],
        "thrissur", "thrissur-thrissur-city", 5, 1_200_000, 1_600_000,
        ["morning", "afternoon"], 8, False, ["Malayalam", "English"],
        "Looked after children from newborn to school age",
    ),
    (
        "Ramla Beevi", "maid", ["cleaning", "cooking", "laundry"],
        "kozhikode", "kozhikode-kozhikode-city", 15, 1_100_000, 1_500_000,
        ["morning", "evening"], 6, False, ["Malayalam"],
        "Fifteen years with the same two families in Kozhikode",
    ),
    (
        "Preetha Nair", "cook", ["cooking"],
        "kollam", "kollam-kollam-city", 7, 1_000_000, 1_400_000,
        ["morning"], 5, False, ["Malayalam", "Tamil"],
        "Vegetarian and non-vegetarian, daily meals for large families",
    ),
    (
        "Lissy Varghese", "home_nurse", ["patient_care", "elder_care"],
        "kottayam", "kottayam-pala", 11, 2_000_000, 2_600_000,
        ["full_day"], 12, True, ["Malayalam", "English"],
        "Bedridden patient care, injections and mobility support",
    ),
    (
        "Suresh Babu", "gardener", ["gardening", "errands"],
        "wayanad", "wayanad-kalpetta", 20, 800_000, 1_100_000,
        ["morning"], 4, False, ["Malayalam", "Kannada"],
        "Kitchen gardens, coconut and areca palms",
    ),
    (
        "Jameela Rasheed", "maid", ["cleaning", "laundry", "ironing", "cooking"],
        "malappuram", "malappuram-manjeri", 3, 850_000, 1_150_000,
        ["afternoon"], 4, False, ["Malayalam"],
        "Afternoon help, cleaning and kitchen work",
    ),
    (
        "Deepa Krishnan", "child_care", ["baby_care", "elder_care"],
        "ernakulam", "ernakulam-aluva", 6, 1_300_000, 1_700_000,
        ["morning", "afternoon"], 8, True, ["Malayalam", "English", "Hindi"],
        "Nanny and elder companion, happy to live in",
    ),
    (
        "Molly Sebastian", "cook", ["cooking", "cleaning", "errands"],
        "alappuzha", "alappuzha-cherthala", 10, 1_150_000, 1_500_000,
        ["morning", "evening"], 7, False, ["Malayalam"],
        "Traditional Kerala home cooking, seafood a speciality",
    ),
    (
        "Vinod Chandran", "driver", ["driving"],
        "kannur", "kannur-kannur-city", 5, 1_400_000, 1_800_000,
        ["full_day"], 10, False, ["Malayalam", "Hindi"],
        "School runs, hospital trips and airport transfers",
    ),
    (
        "Sainaba K", "elder_care", ["elder_care", "cooking", "cleaning"],
        "palakkad", "palakkad-palakkad-town", 9, 1_250_000, 1_650_000,
        ["full_day"], 10, True, ["Malayalam", "Tamil"],
        "Patient, experienced carer for elderly couples",
    ),
    (
        "Geetha Pillai", "maid", ["cleaning", "laundry"],
        "pathanamthitta", "pathanamthitta-thiruvalla", 2, 800_000, 1_000_000,
        ["morning"], 3, False, ["Malayalam"],
        "Starting out, dependable and quick to learn",
    ),
]

#: Ratings applied to the first N demo helpers, so the browse sort has something
#: meaningful to order by. Left as (avg, count) pairs.
DEMO_RATINGS = [
    (4.9, 23), (4.8, 41), (4.6, 12), (4.9, 18), (5.0, 9),
    (4.7, 15), (4.8, 52), (4.5, 7), (4.9, 31), (4.4, 11),
    (4.6, 5), (4.7, 14), (4.8, 26), (4.3, 8), (4.9, 19),
    (None, 0),
]

#: Notifications for the demo family account, newest first.
#: kind, title, body, link, already-read
DEMO_NOTIFICATIONS = [
    (
        "hire_request",
        "Sujatha Menon accepted your request",
        "She can start from the 18th. Message her to agree the timings.",
        "/hires",
        False,
    ),
    (
        "message",
        "New message from Fathima Nida T",
        "“I am free on weekday mornings after the 20th.”",
        "/messages",
        False,
    ),
    (
        "profile",
        "3 new home nurses in Kakkanad",
        "Matches for the search you saved last week.",
        "/?service=home_nurse&district=ernakulam",
        False,
    ),
    (
        "billing",
        "Your membership renewed",
        "₹99 for the month. Nothing was taken from anyone's salary.",
        "/pricing",
        True,
    ),
]
