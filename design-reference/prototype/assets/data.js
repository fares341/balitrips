/* =====================================================================
   BALI TRIPS — Demo content (prototype data)
   كل الأسعار والتقييمات والمواعيد هنا بيانات تجريبية للعرض فقط.
   Prices marked "site" come from the current balitrips.co listing; all
   others are mockup values to be replaced from the admin dashboard.
   ===================================================================== */
(function () {
const I = (n) => "assets/img/" + n + ".jpg";

/* Geo → map image px (bali-sat.jpg is 2048×1399, equirectangular crop) */
const geo = (lat, lon) => ({ x: (190 + (lon - 114.43) * 485) * 2.048, y: (155 + ((-lat) - 8.07) * 485) * 2.048 });

const REGIONS = [
  { id: "ubud", img: I("rice-walk"), lat: -8.5069, lon: 115.2625, zone: "free",
    name: { ar: "أوبود", en: "Ubud" }, tag: { ar: "الطبيعة والثقافة والاسترخاء", en: "Nature, culture & calm" },
    about: { ar: "قلب بالي الثقافي: مدرجات الأرز، الغابات، المعابد، وورش الفنون. مناسبة للأزواج والعائلات ومحبي الهدوء.", en: "Bali's cultural heart: rice terraces, jungle, temples and art studios. Suits couples, families and slow travelers." },
    best: { ar: "٢–٣ أيام", en: "2–3 days" } },
  { id: "canggu", img: I("beach-palms"), lat: -8.6478, lon: 115.1385,
    name: { ar: "تشانغو", en: "Canggu" }, tag: { ar: "الشواطئ وركوب الأمواج والكافيهات", en: "Surf, beaches & cafés" },
    about: { ar: "ساحل حيوي بكافيهات مختصة وغروب جميل وأجواء شبابية.", en: "A lively coast with specialty cafés, sunsets and a young crowd." },
    best: { ar: "١–٢ يوم", en: "1–2 days" } },
  { id: "seminyak", img: I("sunset"), lat: -8.6913, lon: 115.1569,
    name: { ar: "سيمينياك", en: "Seminyak" }, tag: { ar: "الشواطئ والمطاعم والتسوق", en: "Beaches, dining & shopping" },
    about: { ar: "مطاعم راقية ومتاجر ومنتجعات شاطئية قريبة من المطار.", en: "Fine dining, boutiques and beach resorts close to the airport." },
    best: { ar: "١–٢ يوم", en: "1–2 days" } },
  { id: "uluwatu", img: I("cliff-beach"), lat: -8.8291, lon: 115.0849,
    name: { ar: "أولواتو", en: "Uluwatu" }, tag: { ar: "الإطلالات والمنحدرات والشواطئ", en: "Cliffs, views & beaches" },
    about: { ar: "منحدرات شاهقة فوق المحيط، معبد أولواتو، وشواطئ مخفية بين الصخور.", en: "Sheer ocean cliffs, Uluwatu Temple and hidden coves." },
    best: { ar: "١–٢ يوم", en: "1–2 days" } },
  { id: "nusa-penida", img: I("kelingking"), lat: -8.7300, lon: 115.5300,
    name: { ar: "نوسا بينيدا", en: "Nusa Penida" }, tag: { ar: "الجزر والمناظر الطبيعية والمغامرات", en: "Islands, views & adventure" },
    about: { ar: "جزيرة قريبة برحلة قارب؛ أشهر إطلالات بالي مثل كيلينغكينغ وشاطئ دايموند.", en: "A short boat ride away; home to Kelingking and Diamond Beach." },
    best: { ar: "يوم كامل", en: "Full day" } },
  { id: "kintamani", img: I("aerial-cliff"), lat: -8.2550, lon: 115.3550,
    name: { ar: "كينتاماني", en: "Kintamani" }, tag: { ar: "البركان والبحيرة وشروق الشمس", en: "Volcano, lake & sunrise" },
    about: { ar: "منطقة جبلية باردة نسبيًا تطل على جبل باتور وبحيرته.", en: "Cool highlands facing Mount Batur and its crater lake." },
    best: { ar: "نصف يوم", en: "Half day" } },
  { id: "east-bali", img: I("lempuyang"), lat: -8.4000, lon: 115.6000,
    name: { ar: "شرق بالي", en: "East Bali" }, tag: { ar: "المعابد والقصور المائية", en: "Temples & water palaces" },
    about: { ar: "بوابات لمبويانغ الشهيرة، قصر تيرتا غانغا المائي، وقرى هادئة.", en: "Lempuyang's famous gates, Tirta Gangga water palace and quiet villages." },
    best: { ar: "يوم كامل", en: "Full day" } },
];

/* Map categories (managed from Admin → Map) */
const CATS = [
  { id: "restaurants", icon: "food", name: { ar: "المطاعم", en: "Restaurants" },
    subs: [ ["fine", { ar: "فاخرة", en: "Fine dining" }], ["local", { ar: "محلية", en: "Local" }], ["arabic", { ar: "عربية", en: "Arabic" }], ["italian", { ar: "إيطالية", en: "Italian" }], ["indian", { ar: "هندية", en: "Indian" }] ] },
  { id: "cafes", icon: "coffee", name: { ar: "الكافيهات", en: "Cafés" } },
  { id: "activities", icon: "bolt", name: { ar: "الفعاليات والمغامرات", en: "Activities" } },
  { id: "beaches", icon: "wave", name: { ar: "الشواطئ", en: "Beaches" } },
  { id: "waterfalls", icon: "drop", name: { ar: "الشلالات", en: "Waterfalls" } },
  { id: "resorts", icon: "bed", name: { ar: "المنتجعات والفنادق", en: "Resorts & hotels" } },
  { id: "landmarks", icon: "temple", name: { ar: "أماكن سياحية", en: "Landmarks" } },
];
const TAGS = [ ["family", { ar: "للعائلات", en: "Family" }], ["romantic", { ar: "رومانسية", en: "Romantic" }], ["photo", { ar: "للتصوير", en: "Photo spots" }] ];

const P = (id, cat, sub, region, lat, lon, img, ar, en, dar, den, tags, rating, extra) =>
  Object.assign({ id, cat, sub, region, lat, lon, img, name: { ar, en }, desc: { ar: dar, en: den }, tags: tags || [], rating }, extra || {});

const PLACES = [
  P("tegallalang", "landmarks", null, "ubud", -8.4312, 115.2793, "rice-walk", "مدرجات تيغالالانغ", "Tegallalang Rice Terraces", "مدرجات أرز خضراء على منحدرات الوادي، أجمل وقت لزيارتها قبل التاسعة صباحًا.", "Emerald rice terraces down a valley; best before 9am.", ["photo", "family"], 4.7, { activity: "rice-terrace-walk" }),
  P("monkey-forest", "landmarks", null, "ubud", -8.5188, 115.2585, "monkey", "غابة القرود المقدسة", "Sacred Monkey Forest", "غابة ومعابد قديمة يعيش فيها قرود المكاك. احفظ أغراضك جيدًا.", "Ancient temples in a forest full of macaques. Keep belongings close.", ["family"], 4.5, { activity: "monkey-forest" }),
  P("locavore", "restaurants", "fine", "ubud", -8.5108, 115.2631, "jungle-pool", "Locavore", "Locavore", "مطعم تذوّق يعتمد على مكونات محلية من بالي. الحجز المسبق ضروري.", "Tasting menus built on Balinese produce. Book ahead.", ["romantic"], 4.8, { price: "$$$$" }),
  P("ubud-warung", "restaurants", "local", "ubud", -8.5060, 115.2660, "jungle", "وارونغ محلي (نموذج)", "Local warung (sample)", "أطباق إندونيسية منزلية بأسعار مناسبة.", "Home-style Indonesian plates at fair prices.", ["family"], 4.4, { price: "$" }),
  P("campuhan", "landmarks", null, "ubud", -8.5030, 115.2540, "jungle", "ممشى كامبوهان", "Campuhan Ridge Walk", "ممشى سهل على حافة تل أخضر، مناسب للصباح الباكر.", "An easy ridge walk; go early.", ["photo", "romantic"], 4.6),
  P("ayung-spa", "resorts", null, "ubud", -8.4950, 115.2470, "jungle-pool", "منتجع وسبا وادي أيونغ", "Ayung Valley Spa Resort", "مسبح لا نهائي فوق الغابة وجلسات سبا بالي التقليدية.", "Infinity pool over the jungle and Balinese spa rituals.", ["romantic"], 4.8, { activity: "jungle-spa" }),
  P("tegenungan", "waterfalls", null, "ubud", -8.5751, 115.2894, "jungle", "شلال تيغينونغان", "Tegenungan Waterfall", "شلال قريب من أوبود يسهل الوصول إليه.", "An easy-to-reach waterfall near Ubud.", ["family", "photo"], 4.4),
  P("bali-swing", "activities", null, "ubud", -8.4300, 115.2430, "swing", "أرجوحة بالي", "Bali Swing", "أرجوحة فوق وادي الغابة مع منصات تصوير.", "Swings over the jungle valley with photo decks.", ["photo", "family"], 4.5, { activity: "bali-swing" }),
  P("tirta-empul", "landmarks", null, "ubud", -8.4152, 115.3153, "temple-gate", "معبد تيرتا إمبول", "Tirta Empul Temple", "معبد الينابيع المقدسة؛ يلزم لباس محتشم ووشاح.", "Holy spring temple; modest dress and sarong required.", ["family"], 4.6),
  P("batur", "activities", null, "kintamani", -8.2420, 115.3750, "aerial-cliff", "جبل باتور", "Mount Batur", "صعود فجري لمشاهدة شروق الشمس فوق فوهة البركان.", "A pre-dawn hike to watch sunrise over the caldera.", ["photo"], 4.7, { activity: "batur-sunrise" }),
  P("kintamani-view", "cafes", null, "kintamani", -8.2700, 115.3440, "aerial-cliff", "كافيه إطلالة البركان (نموذج)", "Volcano view café (sample)", "إفطار بإطلالة مباشرة على جبل باتور والبحيرة.", "Breakfast facing Mount Batur and the lake.", ["romantic", "photo"], 4.3),
  P("sekumpul", "waterfalls", null, "kintamani", -8.1717, 115.1820, "jungle", "شلال سيكومبول", "Sekumpul Waterfall", "من أجمل شلالات بالي؛ النزول يتطلب لياقة متوسطة.", "One of Bali's finest falls; moderate descent.", ["photo"], 4.8, { activity: "sekumpul-trek" }),
  P("ulun-danu", "landmarks", null, "kintamani", -8.2752, 115.1668, "ulun-danu", "معبد أولون دانو براتان", "Ulun Danu Beratan", "معبد عائم على بحيرة براتان في المرتفعات.", "A lakeside temple in the cool highlands.", ["photo", "family"], 4.7),
  P("echo-beach", "beaches", null, "canggu", -8.6551, 115.1250, "beach-palms", "شاطئ إيكو", "Echo Beach", "شاطئ لركوب الأمواج وغروب الشمس.", "Surf beach with sunset views.", ["romantic"], 4.4),
  P("crate", "cafes", null, "canggu", -8.6487, 115.1380, "flatlay", "Crate Café", "Crate Café", "كافيه إفطار شهير في تشانغو.", "A popular breakfast café in Canggu.", [], 4.5, { price: "$" }),
  P("tanah-lot", "landmarks", null, "canggu", -8.6212, 115.0868, "temple-gate", "معبد تانا لوت", "Tanah Lot", "معبد على صخرة في البحر، مشهور وقت الغروب.", "A sea-rock temple, famous at sunset.", ["photo", "family"], 4.6),
  P("seminyak-beach", "beaches", null, "seminyak", -8.6913, 115.1569, "sunset", "شاطئ سيمينياك", "Seminyak Beach", "شاطئ رملي واسع ومطاعم على البحر.", "Wide sand and beachfront dining.", ["romantic", "family"], 4.4),
  P("italian-sem", "restaurants", "italian", "seminyak", -8.6870, 115.1630, "polaroids", "مطعم إيطالي (نموذج)", "Italian trattoria (sample)", "باستا طازجة وبيتزا على الحطب.", "Fresh pasta and wood-fired pizza.", ["romantic"], 4.5, { price: "$$" }),
  P("indian-sem", "restaurants", "indian", "seminyak", -8.6800, 115.1610, "flatlay", "مطعم هندي (نموذج)", "Indian kitchen (sample)", "أطباق هندية حلال بخيارات نباتية.", "Halal Indian plates with vegetarian options.", ["family"], 4.3, { price: "$$" }),
  P("arabic-kuta", "restaurants", "arabic", "seminyak", -8.7180, 115.1700, "flatlay-wide", "مطعم عربي (نموذج)", "Arabic restaurant (sample)", "مشاوي ومقبلات عربية حلال.", "Halal Arabic grills and mezze.", ["family"], 4.4, { price: "$$" }),
  P("waterbom", "activities", null, "seminyak", -8.7284, 115.1688, "beach-palms", "ووتربوم بالي", "Waterbom Bali", "حديقة ألعاب مائية مناسبة للعائلات والأطفال.", "A water park for families and kids.", ["family"], 4.7, { activity: "waterbom" }),
  P("uluwatu-temple", "landmarks", null, "uluwatu", -8.8291, 115.0849, "cliff-beach", "معبد أولواتو", "Uluwatu Temple", "معبد على حافة المنحدر وعرض رقصة كيتشاك وقت الغروب.", "Clifftop temple with the Kecak fire dance at sunset.", ["photo", "romantic"], 4.7, { activity: "kecak-uluwatu" }),
  P("padang", "beaches", null, "uluwatu", -8.8110, 115.1000, "cliff-beach", "شاطئ بادانغ بادانغ", "Padang Padang Beach", "خليج صغير بين الصخور بمياه صافية.", "A small cove between rocks with clear water.", ["romantic"], 4.5),
  P("cliff-dinner", "restaurants", "fine", "uluwatu", -8.8150, 115.0880, "sunset", "عشاء على المنحدر (نموذج)", "Cliffside dinner (sample)", "عشاء غروب بإطلالة على المحيط.", "Sunset dinner above the ocean.", ["romantic"], 4.8, { activity: "cliff-dinner", price: "$$$" }),
  P("nusa-dua-ws", "activities", null, "uluwatu", -8.7960, 115.2320, "penida-cove", "الرياضات المائية — نوسا دوا", "Water sports — Nusa Dua", "بانانا بوت، باراسيلينغ، وجيت سكي في مياه هادئة.", "Banana boat, parasailing and jet ski in calm water.", ["family"], 4.5, { activity: "water-sports" }),
  P("kelingking", "beaches", null, "nusa-penida", -8.7506, 115.4741, "kelingking", "شاطئ كيلينغكينغ", "Kelingking Beach", "إطلالة الـ T-Rex الشهيرة. النزول للشاطئ شديد الانحدار.", "The famous T-Rex view. The descent is steep.", ["photo"], 4.8, { activity: "penida-day" }),
  P("diamond", "beaches", null, "nusa-penida", -8.7787, 115.6150, "penida-cove", "شاطئ دايموند", "Diamond Beach", "رمال بيضاء وصخور مدببة على الساحل الشرقي.", "White sand and spiked rocks on the east coast.", ["photo", "romantic"], 4.8),
  P("crystal-bay", "beaches", null, "nusa-penida", -8.7150, 115.4590, "penida-cove", "خليج كريستال", "Crystal Bay", "سنوركل في مياه صافية.", "Snorkeling in clear water.", ["family"], 4.4),
  P("lempuyang", "landmarks", null, "east-bali", -8.3910, 115.6310, "lempuyang", "بوابات لمبويانغ", "Lempuyang Gates", "بوابات السماء الشهيرة؛ الانتظار للصورة قد يطول.", "The famous Gates of Heaven; the photo queue can be long.", ["photo"], 4.6, { activity: "east-bali-temples" }),
  P("tirta-gangga", "landmarks", null, "east-bali", -8.4120, 115.5870, "temple-gate", "قصر تيرتا غانغا", "Tirta Gangga", "قصر مائي بأحواض وأحجار عبور.", "A water palace with ponds and stepping stones.", ["family", "photo"], 4.6),
].map(p => Object.assign(p, geo(p.lat, p.lon)));
REGIONS.forEach(r => Object.assign(r, geo(r.lat, r.lon)));

/* Free (unlocked) map zone — Ubud area polygon in image px. */
const FREE_ZONE = [ [1065, 690], [1185, 640], [1300, 700], [1320, 860], [1220, 930], [1090, 905], [1035, 800] ];

/* ---------------- Activities ---------------- */
const ACT_CATS = [
  ["all", { ar: "الكل", en: "All" }], ["adventure", { ar: "المغامرات", en: "Adventure" }], ["beaches", { ar: "الشواطئ", en: "Beaches" }],
  ["restaurants", { ar: "المطاعم", en: "Restaurants" }], ["cafes", { ar: "الكافيهات", en: "Cafés" }], ["nature", { ar: "الطبيعة", en: "Nature" }],
  ["families", { ar: "العائلات", en: "Families" }], ["kids", { ar: "الأطفال", en: "Kids" }], ["photo", { ar: "التصوير", en: "Photography" }], ["culture", { ar: "الثقافة", en: "Culture" }],
];

const STD_EXCL = { ar: ["المصاريف الشخصية", "الإكراميات"], en: ["Personal expenses", "Tips"] };
const CANCEL_STD = { ar: "إلغاء مجاني حتى ٤٨ ساعة قبل الموعد. بعد ذلك لا يُسترد المبلغ. (نص تجريبي — تُعتمد السياسة الفعلية من مزود الخدمة)", en: "Free cancellation up to 48h before start; non-refundable after. (Sample text — the provider's real policy applies.)" };

const ACTIVITIES = [
  { id: "water-sports", cats: ["adventure", "beaches", "families"], region: "uluwatu", img: "penida-cove", gallery: ["penida-cove", "beach-palms", "cliff-beach", "sunset"],
    title: { ar: "باقة الرياضات المائية في نوسا دوا", en: "Nusa Dua Water Sports" },
    short: { ar: "بانانا بوت وباراسيلينغ وجيت سكي في مياه هادئة جنوب بالي.", en: "Banana boat, parasailing and jet ski in calm southern waters." },
    durH: 3, duration: { ar: "٣ ساعات", en: "3 hours" }, rating: 4.5, reviews: 128, priceFrom: 45, per: "person", provider: "Provider A",
    slots: ["09:00", "11:00", "14:00"], minAge: { ar: "من ٨ سنوات، ويلزم مرافقة بالغ لمن هم دون ١٢", en: "Age 8+, under-12s with an adult" },
    packages: [
      { id: "basic", name: { ar: "الباقة الأساسية", en: "Basic" }, price: 45, inc: { ar: ["باراسيلينغ (جولة واحدة)", "معدات السلامة", "مدرب معتمد"], en: ["Parasailing (1 round)", "Safety gear", "Certified instructor"] }, exc: { ar: ["بانانا بوت", "التصوير", "التوصيل"], en: ["Banana boat", "Photos", "Transfer"] } },
      { id: "plus", name: { ar: "الباقة الشاملة", en: "All-in" }, price: 79, badge: { ar: "الأكثر شمولًا", en: "Most complete" }, inc: { ar: ["باراسيلينغ", "جيت سكي ١٥ دقيقة", "بانانا بوت", "معدات السلامة"], en: ["Parasailing", "Jet ski 15 min", "Banana boat", "Safety gear"] }, exc: { ar: ["التصوير", "التوصيل"], en: ["Photos", "Transfer"] }, includesAddons: ["banana"] },
      { id: "family", name: { ar: "باقة العائلة", en: "Family" }, price: 160, per: "group", groupMax: 4, inc: { ar: ["٤ أشخاص", "بانانا بوت", "تيوب مائي", "معدات السلامة"], en: ["4 people", "Banana boat", "Water tube", "Safety gear"] }, exc: { ar: ["باراسيلينغ", "التوصيل"], en: ["Parasailing", "Transfer"] }, includesAddons: ["banana"] },
    ],
    addons: [
      { id: "banana", name: { ar: "بانانا بوت", en: "Banana boat" }, price: 15, per: "person", desc: { ar: "جولة ١٥ دقيقة", en: "15-minute ride" } },
      { id: "photo", name: { ar: "تصوير فوتوغرافي", en: "Photo package" }, price: 25, per: "booking", desc: { ar: "صور رقمية للمجموعة", en: "Digital photos for the group" } },
      { id: "extra-ride", name: { ar: "جولة باراسيلينغ إضافية", en: "Extra parasailing round" }, price: 20, per: "qty", max: 3, onlyPkgs: ["basic", "plus"], desc: { ar: "حتى ٣ جولات", en: "Up to 3 rounds" } },
      { id: "video", name: { ar: "فيديو GoPro", en: "GoPro video" }, price: 18, per: "booking", requires: "photo", desc: { ar: "يتطلب اختيار التصوير الفوتوغرافي", en: "Requires the photo package" } },
    ],
    includes: { ar: ["المعدات ومعدات السلامة", "مدرب معتمد", "مناشف وغرف تبديل"], en: ["Gear and safety equipment", "Certified instructor", "Towels and changing rooms"] },
    excludes: STD_EXCL },
  { id: "atv-ubud", cats: ["adventure", "nature", "photo"], region: "ubud", img: "jeep", gallery: ["jeep", "jungle", "rice-walk", "swing"],
    title: { ar: "مغامرة ATV في غابات أوبود", en: "Ubud ATV Jungle Ride" },
    short: { ar: "قيادة دراجات رباعية عبر الطين والأنهار ومدرجات الأرز.", en: "Quad biking through mud, rivers and rice fields." },
    durH: 2, duration: { ar: "ساعتان", en: "2 hours" }, rating: 4.6, reviews: 94, priceFrom: 65, per: "person", provider: "Provider B",
    slots: ["08:00", "10:30", "13:30", "15:30"], minAge: { ar: "السائق من ١٦ سنة؛ الراكب من ٦ سنوات", en: "Driver 16+, passenger 6+" },
    packages: [
      { id: "single", name: { ar: "دراجة فردية", en: "Single ATV" }, price: 65, inc: { ar: ["دراجة لكل شخص", "خوذة وحذاء", "دليل"], en: ["One ATV per person", "Helmet & boots", "Guide"] }, exc: { ar: ["التوصيل", "الغداء"], en: ["Transfer", "Lunch"] } },
      { id: "tandem", name: { ar: "دراجة مزدوجة", en: "Tandem ATV" }, price: 95, per: "group", groupMax: 2, inc: { ar: ["دراجة لشخصين", "خوذتان وحذاء", "دليل"], en: ["One ATV for two", "Helmets & boots", "Guide"] }, exc: { ar: ["التوصيل", "الغداء"], en: ["Transfer", "Lunch"] } },
    ],
    addons: [
      { id: "lunch", name: { ar: "غداء محلي", en: "Local lunch" }, price: 10, per: "person" },
      { id: "photo", name: { ar: "تصوير فوتوغرافي", en: "Photo package" }, price: 20, per: "booking" },
    ],
    includes: { ar: ["التدريب قبل الانطلاق", "معدات السلامة", "مياه وفوطة"], en: ["Briefing", "Safety gear", "Water and towel"] }, excludes: STD_EXCL },
  { id: "batur-sunrise", cats: ["adventure", "nature", "photo"], region: "kintamani", img: "aerial-cliff", gallery: ["aerial-cliff", "sunset", "jungle"],
    title: { ar: "صعود جبل باتور لشروق الشمس", en: "Mount Batur Sunrise Hike" },
    short: { ar: "انطلاق فجرًا وصعود مع مرشد محلي لمشاهدة الشروق من القمة.", en: "A pre-dawn climb with a local guide to watch sunrise from the summit." },
    durH: 6, duration: { ar: "٦ ساعات", en: "6 hours" }, rating: 4.7, reviews: 210, priceFrom: 55, per: "person", provider: "Provider C", siteprice: true,
    slots: ["02:00"], minAge: { ar: "من ١٠ سنوات بلياقة جيدة", en: "Age 10+ with good fitness" } },
  { id: "penida-day", cats: ["beaches", "photo", "adventure"], region: "nusa-penida", img: "kelingking", gallery: ["kelingking", "penida-cove", "aerial-cliff"],
    title: { ar: "يوم كامل في نوسا بينيدا", en: "Nusa Penida Day Trip" },
    short: { ar: "قارب سريع وجولة على كيلينغكينغ وشاطئ دايموند وخليج كريستال.", en: "Fast boat plus Kelingking, Diamond Beach and Crystal Bay." },
    durH: 10, duration: { ar: "يوم كامل", en: "Full day" }, rating: 4.8, reviews: 176, priceFrom: 89, per: "person", provider: "Provider D", multiDay: false,
    slots: ["07:00"], minAge: { ar: "مناسب لجميع الأعمار؛ النزول لشاطئ كيلينغكينغ غير مناسب للأطفال", en: "All ages; Kelingking descent not for kids" } },
  { id: "jungle-spa", cats: ["nature", "families"], region: "ubud", img: "jungle-pool", gallery: ["jungle-pool", "jungle", "rice-walk"],
    title: { ar: "طقوس سبا الغابة في أوبود", en: "Ubud Jungle Spa Ritual" },
    short: { ar: "تدليك بالي تقليدي وحمام زهور بإطلالة على الغابة.", en: "Balinese massage and flower bath facing the jungle." },
    durH: 3, duration: { ar: "٣ ساعات", en: "3 hours" }, rating: 4.8, reviews: 88, priceFrom: 60, per: "person", provider: "Provider E", siteprice: true,
    slots: ["10:00", "13:00", "16:00"] },
  { id: "sekumpul-trek", cats: ["nature", "adventure", "photo"], region: "kintamani", img: "jungle", gallery: ["jungle", "aerial-cliff"],
    title: { ar: "رحلة شلال سيكومبول", en: "Sekumpul Waterfall Trek" },
    short: { ar: "مسار في الغابة إلى أحد أجمل شلالات بالي.", en: "A jungle trail to one of Bali's finest waterfalls." },
    durH: 5, duration: { ar: "٥ ساعات", en: "5 hours" }, rating: 4.7, reviews: 63, priceFrom: 40, per: "person", provider: "Provider C", siteprice: true, slots: ["08:00", "10:00"] },
  { id: "kecak-uluwatu", cats: ["culture", "families", "photo"], region: "uluwatu", img: "cliff-beach", gallery: ["cliff-beach", "sunset", "temple-gate"],
    title: { ar: "رقصة كيتشاك النارية في أولواتو", en: "Uluwatu Kecak Fire Dance" },
    short: { ar: "عرض ثقافي وقت الغروب على حافة المنحدر.", en: "A cultural show at sunset on the cliff edge." },
    durH: 2, duration: { ar: "ساعتان", en: "2 hours" }, rating: 4.6, reviews: 142, priceFrom: 15, per: "person", provider: "Provider F", siteprice: true, slots: ["17:30"] },
  { id: "waterbom", cats: ["families", "kids", "adventure"], region: "seminyak", img: "beach-palms", gallery: ["beach-palms", "penida-cove"],
    title: { ar: "يوم في ووتربوم بالي", en: "Waterbom Bali Day Pass" },
    short: { ar: "حديقة ألعاب مائية للعائلات والأطفال.", en: "A water park for families and kids." },
    durH: 8, duration: { ar: "يوم كامل", en: "Full day" }, rating: 4.7, reviews: 301, priceFrom: 38, per: "person", provider: "Provider G", siteprice: true, slots: ["09:00"] },
  { id: "bali-swing", cats: ["photo", "families", "nature"], region: "ubud", img: "swing", gallery: ["swing", "jungle", "rice-walk"],
    title: { ar: "أرجوحة بالي ومنصات التصوير", en: "Bali Swing & Photo Decks" },
    short: { ar: "أرجوحة فوق الوادي مع فستان طائر اختياري للتصوير.", en: "Valley swings with optional flying-dress photos." },
    durH: 2, duration: { ar: "ساعتان", en: "2 hours" }, rating: 4.4, reviews: 77, priceFrom: 35, per: "person", provider: "Provider H", slots: ["09:00", "11:00", "14:00", "16:00"] },
  { id: "monkey-forest", cats: ["families", "kids", "nature"], region: "ubud", img: "monkey", gallery: ["monkey", "jungle"],
    title: { ar: "زيارة غابة القرود مع مرشد", en: "Monkey Forest Guided Visit" },
    short: { ar: "جولة آمنة للعائلات مع شرح عن المعابد والغابة.", en: "A family-safe tour with temple and forest stories." },
    durH: 2, duration: { ar: "ساعتان", en: "2 hours" }, rating: 4.5, reviews: 55, priceFrom: 20, per: "person", provider: "Provider H", slots: ["09:00", "13:00"] },
  { id: "east-bali-temples", cats: ["culture", "photo"], region: "east-bali", img: "lempuyang", gallery: ["lempuyang", "temple-gate", "ulun-danu"],
    title: { ar: "جولة معابد شرق بالي", en: "East Bali Temples Tour" },
    short: { ar: "بوابات لمبويانغ وقصر تيرتا غانغا في يوم واحد.", en: "Lempuyang Gates and Tirta Gangga in one day." },
    durH: 10, duration: { ar: "يوم كامل", en: "Full day" }, rating: 4.6, reviews: 69, priceFrom: 70, per: "person", provider: "Provider D", slots: ["06:00"] },
  { id: "cliff-dinner", cats: ["restaurants"], region: "uluwatu", img: "sunset", gallery: ["sunset", "cliff-beach"],
    title: { ar: "عشاء الغروب على المنحدر", en: "Cliffside Sunset Dinner" },
    short: { ar: "طاولة محجوزة بإطلالة على المحيط وقت الغروب.", en: "A reserved table over the ocean at sunset." },
    durH: 2, duration: { ar: "ساعتان", en: "2 hours" }, rating: 4.8, reviews: 40, priceFrom: 85, per: "person", provider: "Partner restaurant", siteprice: true, slots: ["17:30", "19:30"] },
  { id: "crate-breakfast", cats: ["cafes"], region: "canggu", img: "flatlay", gallery: ["flatlay", "polaroids"],
    title: { ar: "إفطار في Crate Café", en: "Breakfast at Crate Café" },
    short: { ar: "حجز طاولة إفطار في كافيه تشانغو الشهير.", en: "A breakfast table at Canggu's well-known café." },
    durH: 1, duration: { ar: "ساعة", en: "1 hour" }, rating: 4.5, reviews: 33, priceFrom: 12, per: "person", provider: "Partner café", siteprice: true, slots: ["07:00", "08:30", "10:00"] },
  { id: "rice-terrace-walk", cats: ["nature", "photo", "families"], region: "ubud", img: "rice-walk", gallery: ["rice-walk", "jungle", "swing"],
    title: { ar: "مشي صباحي في مدرجات تيغالالانغ", en: "Tegallalang Morning Walk" },
    short: { ar: "جولة مشي مع مرشد قبل الزحام وتذوق قهوة بالي.", en: "A guided walk before the crowds, with Bali coffee tasting." },
    durH: 3, duration: { ar: "٣ ساعات", en: "3 hours" }, rating: 4.6, reviews: 48, priceFrom: 30, per: "person", provider: "Provider B", slots: ["06:30", "08:00"] },
];

/* default packages/addons for activities that don't define their own */
ACTIVITIES.forEach(a => {
  if (!a.packages) a.packages = [
    { id: "std", name: { ar: "الباقة الأساسية", en: "Standard" }, price: a.priceFrom, inc: { ar: ["النشاط الأساسي", "مرشد محلي", "رسوم الدخول"], en: ["Core activity", "Local guide", "Entry fees"] }, exc: { ar: ["التوصيل", "الوجبات"], en: ["Transfer", "Meals"] } },
    { id: "plus", name: { ar: "الباقة الشاملة", en: "All-in" }, price: Math.round(a.priceFrom * 1.55), inc: { ar: ["النشاط الأساسي", "مرشد محلي", "رسوم الدخول", "وجبة خفيفة"], en: ["Core activity", "Local guide", "Entry fees", "Snack"] }, exc: { ar: ["التوصيل"], en: ["Transfer"] } },
  ];
  if (!a.addons) a.addons = [ { id: "photo", name: { ar: "تصوير فوتوغرافي", en: "Photo package" }, price: 20, per: "booking" } ];
  a.includes = a.includes || { ar: ["مرشد محلي", "رسوم الدخول"], en: ["Local guide", "Entry fees"] };
  a.excludes = a.excludes || STD_EXCL;
  a.cancel = a.cancel || CANCEL_STD;
  a.faq = a.faq || [
    [{ ar: "هل يشمل السعر التوصيل من الفندق؟", en: "Is hotel transfer included?" }, { ar: "لا، يمكنك إضافة سائق للفعالية من نموذج الحجز ويُحسب سعره ضمن الإجمالي.", en: "No — add a driver in the booking form and it's added to your total." }],
    [{ ar: "متى يصلني تأكيد الحجز؟", en: "When is my booking confirmed?" }, { ar: "بعد الدفع يظهر الطلب بحالة «بانتظار تأكيد المزود»، ثم يصلك التأكيد النهائي عبر البريد وواتساب.", en: "After payment the booking shows 'Awaiting provider'; final confirmation arrives by email and WhatsApp." }],
    [{ ar: "ماذا أرتدي؟", en: "What should I wear?" }, { ar: "ملابس مريحة وحذاء مناسب للنشاط. تُذكر أي متطلبات خاصة في تعليمات المشاركة.", en: "Comfortable clothes and suitable shoes; special requirements are listed in the instructions." }],
  ];
});

/* ---------------- Ready itineraries (downloadable files) ---------------- */
const ITINERARIES = [
  { id: "3-days", days: 3, img: "cliff-beach", price: 39, regions: ["seminyak", "uluwatu"], type: ["economy", "couples"],
    name: { ar: "جنوب بالي في ٣ أيام", en: "South Bali in 3 Days" }, short: { ar: "مثالي للزيارة القصيرة: شواطئ ومنحدرات وغروب.", en: "For short stays: beaches, cliffs and sunsets." },
    fit: { ar: "زيارة أولى قصيرة، الأزواج", en: "Short first visits, couples" } },
  { id: "5-days", days: 5, img: "rice-walk", price: 59, siteprice: true, regions: ["ubud", "seminyak", "uluwatu"], type: ["family", "couples"], popular: true,
    name: { ar: "بالي الأساسية في ٥ أيام", en: "Essential Bali in 5 Days" }, short: { ar: "أوبود والجنوب بتوازن بين الطبيعة والشاطئ.", en: "Ubud and the south, balancing nature and beach." },
    fit: { ar: "الزيارة الأولى، العائلات", en: "First visits, families" } },
  { id: "7-days", days: 7, img: "kelingking", price: 79, siteprice: true, regions: ["ubud", "canggu", "uluwatu", "nusa-penida"], type: ["adventure", "couples"],
    name: { ar: "الجزيرة كاملة في ٧ أيام", en: "The Full Island in 7 Days" }, short: { ar: "يشمل يومًا في نوسا بينيدا وشروق باتور.", en: "Includes Nusa Penida and a Batur sunrise." },
    fit: { ar: "محبو المغامرة والتصوير", en: "Adventure and photo lovers" } },
  { id: "10-days", days: 10, img: "lempuyang", price: 99, siteprice: true, regions: ["ubud", "kintamani", "east-bali", "nusa-penida", "uluwatu"], type: ["honeymoon", "family"],
    name: { ar: "بالي بلا عجلة في ١٠ أيام", en: "Bali Unhurried in 10 Days" }, short: { ar: "شرق بالي والمرتفعات والجزر بإيقاع مريح.", en: "East Bali, highlands and islands at an easy pace." },
    fit: { ar: "شهر العسل، العائلات", en: "Honeymoons, families" } },
];
const DAY_PLANS = {
  ar: ["الوصول والاستقرار في أوبود + عشاء خفيف", "مدرجات تيغالالانغ صباحًا + أرجوحة بالي + سوق أوبود", "غابة القرود + معبد تيرتا إمبول + سبا", "الانتقال إلى أولواتو + معبد أولواتو ورقصة كيتشاك", "شاطئ بادانغ بادانغ + عشاء غروب في جيمباران", "قارب إلى نوسا بينيدا: كيلينغكينغ ودايموند", "صعود باتور فجرًا + كافيه الإطلالة", "شرق بالي: لمبويانغ وتيرتا غانغا", "يوم حر في سيمينياك: تسوق وشاطئ", "سبا وتجهيز للمغادرة"],
  en: ["Arrive and settle in Ubud + light dinner", "Tegallalang at dawn + Bali Swing + Ubud market", "Monkey Forest + Tirta Empul + spa", "Move to Uluwatu + temple and Kecak dance", "Padang Padang + Jimbaran sunset dinner", "Boat to Nusa Penida: Kelingking & Diamond", "Batur sunrise + view café", "East Bali: Lempuyang & Tirta Gangga", "Free day in Seminyak: shops and beach", "Spa and departure prep"],
};

/* ---------------- Tour packages (bundles) — prices from current site ---------------- */
const PACKAGES = [
  { id: "honeymoon", img: "green-dress", days: 6, people: 2, price: 690, driver: true, theme: { ar: "شهر العسل", en: "Honeymoon" },
    name: { ar: "باقة شهر العسل", en: "Honeymoon Package" }, short: { ar: "فلل خاصة، عشاء على المنحدر، وجداول هادئة لشخصين.", en: "Private villas, cliff dinners and calm days for two." },
    acts: ["jungle-spa", "cliff-dinner", "bali-swing", "kecak-uluwatu"] },
  { id: "adventure", img: "jeep", days: 6, people: 8, price: 540, driver: true, theme: { ar: "مغامرات", en: "Adventure" },
    name: { ar: "باقة المغامرة", en: "Adventure Package" }, short: { ar: "شروق باتور، ATV، رياضات مائية ويوم في نوسا بينيدا.", en: "Batur sunrise, ATV, water sports and Nusa Penida." },
    acts: ["batur-sunrise", "atv-ubud", "water-sports", "penida-day"] },
  { id: "family", img: "travelers-women", days: 5, people: 6, price: 620, driver: true, theme: { ar: "عائلية", en: "Family" },
    name: { ar: "باقة العائلة", en: "Family Package" }, short: { ar: "أيام مريحة بأنشطة تناسب الصغار والكبار.", en: "Easy days with activities for every age." },
    acts: ["waterbom", "monkey-forest", "rice-terrace-walk", "water-sports"] },
  { id: "relax", img: "jungle-pool", days: 5, people: 4, price: 580, driver: false, theme: { ar: "استرخاء", en: "Relaxation" },
    name: { ar: "باقة الاسترخاء", en: "Relaxation Package" }, short: { ar: "سبا ومنتجعات وطبيعة بلا جدول مزدحم.", en: "Spa, resorts and nature without a packed schedule." },
    acts: ["jungle-spa", "rice-terrace-walk", "crate-breakfast"] },
];

/* ---------------- Driver ---------------- */
const VEHICLES = [
  { id: "sedan", min: 1, max: 4, perDay: 55, name: { ar: "سيارة عادية", en: "Standard car" }, ex: { ar: "تويوتا أفانزا أو ما يماثلها", en: "Toyota Avanza or similar" } },
  { id: "suv", min: 5, max: 7, perDay: 70, name: { ar: "سيارة أكبر", en: "Larger car" }, ex: { ar: "تويوتا إينوفا أو ما يماثلها", en: "Toyota Innova or similar" } },
  { id: "van", min: 8, max: 14, perDay: 95, name: { ar: "فان", en: "Van" }, ex: { ar: "تويوتا هايس أو حسب المتاح", en: "Toyota HiAce or as available" } },
];

/* ---------------- Articles ---------------- */
const ARTICLES = [
  { id: "first-time", img: "rice-walk", cat: { ar: "أدلّة", en: "Guides" }, mins: 6, popular: true, date: "2026-09-02",
    title: { ar: "أول مرة في بالي؟ ابدأ بهذه المناطق الثلاث", en: "First time in Bali? Start with these three areas" },
    ex: { ar: "كيف تختار بين أوبود وسيمينياك وأولواتو حسب نوع رحلتك.", en: "How to choose between Ubud, Seminyak and Uluwatu." }, link: "map" },
  { id: "penida-guide", img: "kelingking", cat: { ar: "جزر", en: "Islands" }, mins: 8, date: "2026-08-21",
    title: { ar: "دليل يوم واحد في نوسا بينيدا", en: "A one-day Nusa Penida guide" },
    ex: { ar: "أفضل ترتيب للمواقع، ووقت القارب، وما تحتاج إحضاره.", en: "Best order of stops, boat timing, and what to pack." }, link: "activity" },
  { id: "family-bali", img: "travelers-women", cat: { ar: "عائلات", en: "Families" }, mins: 5, popular: true, date: "2026-08-10",
    title: { ar: "بالي مع الأطفال: أنشطة آمنة ومناسبة", en: "Bali with kids: safe, fun activities" },
    ex: { ar: "اختيارات للأيام الماطرة والمشمسة، ونصائح التنقل.", en: "Picks for rainy and sunny days, plus transport tips." }, link: "packages" },
  { id: "halal-food", img: "flatlay-wide", cat: { ar: "طعام", en: "Food" }, mins: 4, date: "2026-07-28",
    title: { ar: "أين تجد الطعام الحلال في بالي؟", en: "Where to find halal food in Bali" },
    ex: { ar: "مطاعم عربية وهندية وخيارات بحرية في الجنوب.", en: "Arabic, Indian and seafood options in the south." }, link: "map" },
  { id: "driver-tips", img: "driver-car", cat: { ar: "تنقل", en: "Getting around" }, mins: 4, date: "2026-07-12",
    title: { ar: "سائق خاص أم تطبيقات النقل؟", en: "Private driver or ride apps?" },
    ex: { ar: "متى يكون السائق الخاص الخيار الأوفر والأريح.", en: "When a private driver is cheaper and easier." }, link: "driver" },
  { id: "temples", img: "lempuyang", cat: { ar: "ثقافة", en: "Culture" }, mins: 7, date: "2026-06-30",
    title: { ar: "آداب زيارة المعابد في بالي", en: "Temple etiquette in Bali" },
    ex: { ar: "اللباس، والأوقات، وما يجب تجنبه.", en: "Dress, timing, and what to avoid." }, link: "explore" },
];

/* ---------------- Sample reviews (to be replaced by verified reviews) ---------------- */
const REVIEWS = [
  { n: { ar: "مسافر من الرياض", en: "Traveler from Riyadh" }, i: "م", s: 5, svc: { ar: "جدول ٧ أيام", en: "7-day itinerary" }, t: { ar: "نص تجربة حقيقية يُضاف هنا بعد موافقة العميل على النشر.", en: "A real traveler's words go here once they approve publishing." } },
  { n: { ar: "عائلة من الكويت", en: "Family from Kuwait" }, i: "ع", s: 5, svc: { ar: "السائق الخاص", en: "Private driver" }, t: { ar: "مكان مخصص لتقييم موثّق مرتبط بحجز فعلي، مع اسم مختصر وبلد.", en: "Slot for a verified review tied to a real booking, with short name and country." } },
  { n: { ar: "زوجان من دبي", en: "Couple from Dubai" }, i: "ز", s: 4, svc: { ar: "باقة شهر العسل", en: "Honeymoon package" }, t: { ar: "يظهر التقييم أسفل الخدمة التي يخصها فقط، كما طلب صاحب المشروع.", en: "Each review shows only under the service it belongs to." } },
];

window.BT_DATA = { REGIONS, CATS, TAGS, PLACES, FREE_ZONE, ACT_CATS, ACTIVITIES, ITINERARIES, DAY_PLANS, PACKAGES, VEHICLES, ARTICLES, REVIEWS, geo, MAP_W: 2048, MAP_H: 1399, MAP_PRICE: 19 };
})();
