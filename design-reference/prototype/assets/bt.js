/* =====================================================================
   BALI TRIPS — Shared runtime: i18n, header/footer, store (My Trip,
   favorites), toasts, icons, card renderers, helpers.
   Every page: <body data-page="home"> + #hdr / #ftr placeholders.
   ===================================================================== */
(function () {
const D = window.BT_DATA;
const store = {
  get(k, d) { try { const v = localStorage.getItem("bt." + k); return v == null ? d : JSON.parse(v); } catch (e) { return (store._m[k] !== undefined) ? store._m[k] : d; } },
  set(k, v) { store._m[k] = v; try { localStorage.setItem("bt." + k, JSON.stringify(v)); } catch (e) {} },
  _m: {},
};

/* ---------------- Language ---------------- */
let LANG = store.get("lang", "ar");
if (location.hash === "#en") LANG = "en";
const html = document.documentElement;
html.lang = LANG; html.dir = LANG === "ar" ? "rtl" : "ltr";
const t = (o) => (o == null ? "" : typeof o === "string" ? o : (o[LANG] != null ? o[LANG] : o.ar));
const L = (ar, en) => (LANG === "ar" ? ar : en);
function applyStatic(root) {
  if (LANG !== "en") return;
  (root || document).querySelectorAll("[data-en]").forEach(el => { el.innerHTML = el.getAttribute("data-en"); });
  (root || document).querySelectorAll("[data-en-ph]").forEach(el => { el.placeholder = el.getAttribute("data-en-ph"); });
  (root || document).querySelectorAll("[data-en-aria]").forEach(el => { el.setAttribute("aria-label", el.getAttribute("data-en-aria")); });
  (root || document).querySelectorAll("[data-en-title]").forEach(el => { el.title = el.getAttribute("data-en-title"); });
}
function setLang(l) { if (l === "id") { toast(L("النسخة الإندونيسية تُفعّل بعد اعتماد الترجمة من لوحة التحكم.", "Bahasa Indonesia goes live once translations are approved in the dashboard.")); return; } store.set("lang", l); location.reload(); }

/* ---------------- Formatting ---------------- */
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const numAr = (n) => (LANG === "ar" ? Number(n).toLocaleString("ar-EG") : String(n));
/* Arabic count words: 1 شخص · 2 شخصان · 3–10 أشخاص · 11+ شخصًا */
const W = { p: [["شخص", "شخصان", "أشخاص", "شخصًا"], ["person", "people"]], d: [["يوم", "يومان", "أيام", "يومًا"], ["day", "days"]], g: [["مجموعة", "مجموعتان", "مجموعات", "مجموعة"], ["group", "groups"]] };
const cnt = (n, k) => { const w = W[k]; if (LANG !== "ar") return n + " " + w[1][n === 1 ? 0 : 1]; if (n === 1) return w[0][0] + " واحد".replace(" واحد", ""); if (n === 2) return w[0][1]; return numAr(n) + " " + (n <= 10 ? w[0][2] : w[0][3]); };
const cntAr = (n, k) => { const w = W[k][0]; return n === 1 ? w[0] : n === 2 ? w[1] : n + " " + (n <= 10 ? w[2] : w[3]); };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const img = (n) => "assets/img/" + n + ".jpg";
const fmtDate = (iso) => { if (!iso) return "—"; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString(LANG === "ar" ? "ar-EG" : "en-GB", { weekday: "short", day: "numeric", month: "short" }); };
const byId = (arr, id) => arr.find(x => x.id === id);
const region = (id) => byId(D.REGIONS, id);
const hashId = () => decodeURIComponent((location.hash || "").replace(/^#/, "")).split("/")[0];

/* ---------------- Icons (stroke, 24 grid) ---------------- */
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  pin: '<path d="M12 22s7-6.6 7-12.5A7 7 0 0 0 5 9.5C5 15.4 12 22 12 22Z"/><circle cx="12" cy="9.5" r="2.6"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.3-9.7C1.4 7 3.9 4 7.2 4c2 0 3.4 1.1 4.8 2.9C13.4 5.1 14.8 4 16.8 4c3.3 0 5.8 3 4.5 6.8-1.8 5.1-9.3 9.7-9.3 9.7Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  suitcase: '<rect x="4" y="7" width="16" height="13" rx="2.5"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M9 11v5M15 11v5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  chevd: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  star: '<path d="m12 3.5 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 17l-5.3 2.9 1.2-6-4.5-4.1 6-.7L12 3.5Z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"/><path d="M16 5.6a3 3 0 0 1 0 5.8M20.5 19.5c-.4-1.9-1.4-3.4-2.7-4.3"/>',
  car: '<path d="M4.5 16.5V12l1.8-4.6A2 2 0 0 1 8.2 6h7.6a2 2 0 0 1 1.9 1.4l1.8 4.6v4.5"/><path d="M3.5 12h17v4.5h-17z"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  map: '<path d="m9 4-5.5 2v14L9 18l6 2 5.5-2V4L15 6 9 4Z"/><path d="M9 4v14M15 6v14"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  wand: '<path d="m4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2ZM19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6L19 11Z"/>',
  sparkle: '<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 11 10.1 9 12 3.5Z"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"/>',
  wave: '<path d="M2.5 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 4 2M2.5 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 4 2"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  bed: '<path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="10.5" r="1.6"/>',
  temple: '<path d="M12 2.5 8 6h8l-4-3.5ZM6 9h12M7 6.5 5 9.5h14l-2-3M8 12h8M6 12l-1 3h14l-1-3M7 15v6M17 15v6M10 21v-3h4v3"/>',
  food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-2.5 4-2.5 7h2.5v11"/>',
  coffee: '<path d="M4.5 9h12v4.5A4.5 4.5 0 0 1 12 18h-3a4.5 4.5 0 0 1-4.5-4.5V9Z"/><path d="M16.5 10h1.5a2.3 2.3 0 0 1 0 4.6h-1.5M8 3.5v2.5M12 3.5v2.5"/>',
  locate: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.3v.1"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6l-7-3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  chat: '<path d="M4 18.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 1.5Z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>',
  whatsapp: '<path d="M12 3.2A8.8 8.8 0 0 0 4.4 16.4L3.3 20.7l4.4-1.1A8.8 8.8 0 1 0 12 3.2Z"/><path d="M8.8 8.6c0 3.7 2.9 6.6 6.6 6.6.7 0 1.1-.6.9-1.2l-.5-1.3-1.8.5-1.4-1.8.6-1.8-1.3-.5c-.6-.2-1.1.2-1.1.8"/>',
  phone: '<path d="M5 4h3.5l1.5 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.5 20 4 13.5 3.5 5.6A1.5 1.5 0 0 1 5 4Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 7 8.5-7"/>',
  download: '<path d="M12 3.5v12M7 11l5 5 5-5M4.5 20.5h15"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4v-9.5Z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 5-4.8 2 2.2-5 4.8-2Z"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
  play: '<path d="M8 5.5v13l10.5-6.5L8 5.5Z"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m12 12 8-4.5M12 12v9M12 12 4 7.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 8l-4 4 4 4M5 12h11"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.7 16a5 5 0 0 1 6.6 0"/><circle cx="12" cy="19.5" r="1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
};
const icon = (n, s = 20, sw = 1.8) => `<svg ${n === "arrow" || n === "back" ? 'class="ic-dir" ' : ""}width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.info}</svg>`;
const starIcon = (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="${"m12 3.5 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 17l-5.3 2.9 1.2-6-4.5-4.1 6-.7L12 3.5Z"}" fill="currentColor"/></svg>`;

/* ---------------- Trip (cart) + favorites ---------------- */
const Trip = {
  items() { return store.get("trip", []); },
  save(items) { store.set("trip", items); updateBadges(); },
  add(item) { const items = Trip.items(); item.key = item.key || (item.type + "-" + item.ref + "-" + Date.now()); items.push(item); Trip.save(items); return item; },
  remove(key) { Trip.save(Trip.items().filter(i => i.key !== key)); },
  clear() { Trip.save([]); },
  total() { return Trip.items().reduce((s, i) => s + (i.total || 0), 0); },
  count() { return Trip.items().length; },
};
const Fav = {
  all() { return store.get("fav", []); },
  has(id) { return Fav.all().includes(id); },
  toggle(id) { const a = Fav.all(); const i = a.indexOf(id); if (i > -1) a.splice(i, 1); else a.push(id); store.set("fav", a); updateBadges(); return i === -1; },
};
const Auth = { user() { return store.get("user", null); }, login(u) { store.set("user", u); }, logout() { store.set("user", null); } };
const MapAccess = { unlocked() { return !!store.get("mapUnlocked", false); }, set(v) { store.set("mapUnlocked", !!v); } };

/* ---------------- Toast ---------------- */
function toast(msg, opts = {}) {
  let host = document.querySelector(".toasts");
  if (!host) { host = document.createElement("div"); host.className = "toasts"; host.setAttribute("role", "status"); host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
  const el = document.createElement("div"); el.className = "toast" + (opts.err ? " err" : "");
  el.innerHTML = `${icon(opts.err ? "alert" : "check", 20, 2.2)}<span style="flex:1">${msg}</span>${opts.link ? `<a href="${opts.link[1]}">${opts.link[0]}</a>` : ""}`;
  host.appendChild(el); setTimeout(() => { el.style.transition = "opacity .3s, transform .3s"; el.style.opacity = "0"; el.style.transform = "translateY(10px)"; setTimeout(() => el.remove(), 320); }, opts.ms || 3600);
}

/* ---------------- Header ---------------- */
const NAV = [
  ["index", "home.html", "الرئيسية", "Home"],
  ["services", "services.html", "خدماتنا", "Services"],
  ["map", "map.html", "الخريطة التفاعلية", "Interactive Map"],
  ["activities", "activities.html", "الأنشطة والفعاليات", "Activities"],
  ["driver", "driver.html", "السائق", "Driver"],
  ["about", "about.html", "من نحن", "About"],
  ["articles", "articles.html", "المقالات", "Articles"],
];
function renderHeader() {
  const host = document.getElementById("hdr"); if (!host) return;
  const page = document.body.dataset.page || ""; const sect = document.body.dataset.section || page;
  const user = Auth.user();
  const navLinks = NAV.map(([k, h, ar, en]) => `<li><a href="${h}" ${sect === k ? 'aria-current="page"' : ""}>${L(ar, en)}</a></li>`).join("");
  host.outerHTML = `
  <a class="skip" href="#main">${L("تخطَّ إلى المحتوى", "Skip to content")}</a>
  <header class="hdr" id="site-hdr">
    <div class="wrap">
      <div class="hdr-top">
        <div class="hdr-start">
          <button class="icon-btn menu-btn" id="menu-open" aria-label="${L("القائمة", "Menu")}">${icon("menu", 24)}</button>
          <div class="lang-menu">
            <button class="lang-btn" id="lang-btn" aria-label="${L("اللغة", "Language")}" aria-haspopup="true" aria-expanded="false">${icon("globe", 16)} ${LANG === "ar" ? "ع" : "EN"}</button>
            <div class="lang-pop" id="lang-pop" hidden>
              <button data-lang="ar" ${LANG === "ar" ? 'aria-current="true"' : ""}>العربية ${LANG === "ar" ? icon("check", 16) : ""}</button>
              <button data-lang="en" ${LANG === "en" ? 'aria-current="true"' : ""}>English ${LANG === "en" ? icon("check", 16) : ""}</button>
              <button data-lang="id">Bahasa Indonesia <span class="tag tag-forest" style="font-size:11px">${L("قريبًا", "Soon")}</span></button>
            </div>
          </div>
          <a class="icon-btn only-desk" href="search.html" aria-label="${L("البحث", "Search")}">${icon("search", 21)}</a>
          <div class="lang-menu">
            <button class="icon-btn only-desk" id="acct-btn" aria-haspopup="true" aria-expanded="false" aria-label="${L("الحساب", "Account")}">${icon("user", 21)}</button>
            <div class="acct-pop" id="acct-pop" hidden style="inset-inline-start:0;inset-inline-end:auto">
              ${user ? `<div style="padding:10px 12px 8px;font-size:13px" class="muted">${L("مرحبًا،", "Hi,")} <b style="color:var(--forest)">${esc(user.name)}</b></div>
                <a href="account.html#bookings">${L("حجوزاتي", "My bookings")} ${icon("cal", 16)}</a>
                <a href="account.html#files">${L("جداولي وملفاتي", "My itineraries")} ${icon("doc", 16)}</a>
                <a href="account.html#favorites">${L("المفضلة", "Favorites")} ${icon("heart", 16)}</a>
                <a href="account.html#profile">${L("الملف الشخصي", "Profile")} ${icon("user", 16)}</a>
                <button id="logout-btn">${L("تسجيل الخروج", "Log out")} ${icon("logout", 16)}</button>`
              : `<a href="login.html">${L("تسجيل الدخول", "Log in")} ${icon("arrow", 16)}</a><a href="register.html">${L("إنشاء حساب", "Create account")} ${icon("plus", 16)}</a><a href="account.html#favorites">${L("المفضلة", "Favorites")} ${icon("heart", 16)}</a>`}
            </div>
          </div>
        </div>
        <a class="hdr-logo" href="home.html" aria-label="Bali Trips — ${L("الرئيسية", "Home")}"><img src="assets/logo.png" alt="Bali Trips" width="137" height="40"></a>
        <div class="hdr-end">
          <a class="icon-btn" href="search.html" aria-label="${L("البحث", "Search")}" style="display:var(--m-search,inline-grid)" id="m-search">${icon("search", 21)}</a>
          <a class="icon-btn" href="account.html#favorites" aria-label="${L("المفضلة", "Favorites")}" title="${L("المفضلة", "Favorites")}">${icon("heart", 21)}<span class="badge" data-fav-badge hidden>0</span></a>
          <a class="icon-btn" href="my-trip.html" aria-label="${L("رحلتي", "My Trip")}" title="${L("رحلتي", "My Trip")}">${icon("suitcase", 22)}<span class="badge" data-trip-badge hidden>0</span></a>
          <a class="btn btn-primary btn-sm cta-plan" href="services.html">${L("ابدأ التخطيط", "Start Planning")}</a>
        </div>
      </div>
    </div>
    <nav class="hdr-nav" aria-label="${L("التنقل الرئيسي", "Main")}"><div class="wrap"><ul>${navLinks}</ul></div></nav>
  </header>
  <div class="drawer-scrim" id="drawer-scrim"></div>
  <aside class="drawer" id="drawer" aria-label="${L("القائمة", "Menu")}" aria-hidden="true">
    <div class="row between" style="margin-bottom:12px"><img src="assets/logo.png" alt="Bali Trips" style="height:34px"><button class="icon-btn" id="menu-close" aria-label="${L("إغلاق", "Close")}">${icon("x", 22)}</button></div>
    <nav>${NAV.map(([k, h, ar, en]) => `<a href="${h}" ${sect === k ? 'aria-current="page"' : ""}>${L(ar, en)} ${icon("chev", 18)}</a>`).join("")}
      <a href="itineraries.html">${L("الجداول السياحية", "Itineraries")} ${icon("chev", 18)}</a>
      <a href="packages.html">${L("الباقات السياحية", "Tour packages")} ${icon("chev", 18)}</a>
      <a href="custom-trip.html">${L("الرحلة المخصصة", "Custom trip")} ${icon("chev", 18)}</a>
      <a href="explore.html">${L("استكشف بالي", "Explore Bali")} ${icon("chev", 18)}</a>
    </nav>
    <div class="stack" style="margin-top:20px">
      <a class="btn btn-primary btn-block" href="services.html">${L("ابدأ التخطيط", "Start Planning")}</a>
      <a class="btn btn-ghost btn-block" href="${user ? "account.html" : "login.html"}">${icon("user", 18)} ${user ? L("حسابي", "My account") : L("تسجيل الدخول", "Log in")}</a>
      <div class="seg" role="group" aria-label="${L("اللغة", "Language")}"><button data-lang="ar" aria-pressed="${LANG === "ar"}">العربية</button><button data-lang="en" aria-pressed="${LANG === "en"}">English</button><button data-lang="id" aria-pressed="false">Indonesia</button></div>
    </div>
  </aside>`;
  const hdr = document.getElementById("site-hdr");
  const onScroll = () => hdr.classList.toggle("scrolled", scrollY > 8); onScroll(); addEventListener("scroll", onScroll, { passive: true });
  const dr = document.getElementById("drawer"), sc = document.getElementById("drawer-scrim");
  const openD = (o) => { dr.classList.toggle("open", o); sc.classList.toggle("open", o); dr.setAttribute("aria-hidden", !o); if (o) dr.querySelector("a,button").focus(); };
  document.getElementById("menu-open").onclick = () => openD(true);
  document.getElementById("menu-close").onclick = () => openD(false); sc.onclick = () => openD(false);
  addEventListener("keydown", e => { if (e.key === "Escape") { openD(false); closePops(); } });
  const pop = (btnId, popId) => { const b = document.getElementById(btnId), p = document.getElementById(popId); if (!b) return; b.onclick = (e) => { e.stopPropagation(); const o = p.hidden; closePops(); p.hidden = !o; b.setAttribute("aria-expanded", o); }; };
  const closePops = () => document.querySelectorAll(".lang-pop,.acct-pop").forEach(p => p.hidden = true);
  pop("lang-btn", "lang-pop"); pop("acct-btn", "acct-pop"); document.addEventListener("click", closePops);
  document.querySelectorAll("[data-lang]").forEach(b => b.onclick = () => setLang(b.dataset.lang));
  const lo = document.getElementById("logout-btn"); if (lo) lo.onclick = () => { Auth.logout(); location.href = "home.html"; };
  if (matchMedia("(min-width:1024px)").matches) { const ms = document.getElementById("m-search"); if (ms) ms.style.display = "none"; }
}

/* ---------------- Mobile tab bar ---------------- */
function renderTabbar() {
  if (document.body.dataset.notabbar != null) return;
  const sect = document.body.dataset.section || document.body.dataset.page;
  const tabs = [["index", "home.html", "home", "الرئيسية", "Home"], ["map", "map.html", "map", "الخريطة", "Map"], ["activities", "activities.html", "compass", "الأنشطة", "Activities"], ["trip", "my-trip.html", "suitcase", "رحلتي", "My Trip"], ["account", Auth.user() ? "account.html" : "login.html", "user", "حسابي", "Account"]];
  const el = document.createElement("nav"); el.className = "tabbar"; el.setAttribute("aria-label", L("تنقل سريع", "Quick nav"));
  el.innerHTML = tabs.map(([k, h, ic, ar, en]) => `<a href="${h}" ${sect === k ? 'aria-current="page"' : ""}>${icon(ic, 22)}<span>${L(ar, en)}</span>${k === "trip" ? '<span class="badge" data-trip-badge hidden>0</span>' : ""}</a>`).join("");
  document.body.appendChild(el); document.body.classList.add("has-tabbar");
}

/* ---------------- Footer ---------------- */
function renderFooter() {
  const host = document.getElementById("ftr"); if (!host) return;
  const col = (title, links) => `<div><h4>${title}</h4><ul>${links.map(([h, ar, en]) => `<li><a href="${h}">${L(ar, en)}</a></li>`).join("")}</ul></div>`;
  host.outerHTML = `<footer class="ftr">
    <div class="arc" style="width:520px;height:520px;inset-inline-end:-260px;top:-300px;opacity:.18"></div>
    <div class="wrap">
      <div class="ftr-grid">
        <div class="stack" style="gap:14px;max-width:360px">
          <img class="ftr-logo" src="assets/logo-light.png" alt="Bali Trips" width="143" height="42">
          <p>${L("منصة رقمية متخصصة في جزيرة بالي، تساعد المسافر العربي على اكتشاف الجزيرة وتخطيط رحلته وحجز أنشطته من مكان واحد، بخبرة محلية.", "A digital platform dedicated to Bali, helping Arab travelers discover the island, plan their trip and book activities in one place, with local expertise.")}</p>
          <div class="soc" aria-label="${L("حسابات التواصل", "Social")}">
            <a href="https://instagram.com" target="_blank" rel="noopener" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".8" fill="currentColor"/></svg></a>
            <a href="https://tiktok.com" target="_blank" rel="noopener" aria-label="TikTok"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.4 5 4.7"/></svg></a>
            <a href="https://youtube.com" target="_blank" rel="noopener" aria-label="YouTube"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.5 5 2.5-5 2.5v-5Z" fill="currentColor"/></svg></a>
            <a href="contact.html" aria-label="WhatsApp">${icon("whatsapp", 18)}</a>
          </div>
        </div>
        ${col(L("روابط سريعة", "Quick links"), [["home.html", "الرئيسية", "Home"], ["services.html", "خدماتنا", "Services"], ["map.html", "الخريطة التفاعلية", "Interactive map"], ["activities.html", "الأنشطة والفعاليات", "Activities"], ["driver.html", "السائق", "Driver"], ["itineraries.html", "الجداول السياحية", "Itineraries"], ["packages.html", "الباقات السياحية", "Tour packages"], ["articles.html", "المقالات", "Articles"], ["about.html", "من نحن", "About"]])}
        ${col(L("السياسات", "Policies"), [["policy.html#privacy", "سياسة الخصوصية", "Privacy policy"], ["policy.html#terms", "الشروط والأحكام", "Terms & conditions"], ["policy.html#cancellation", "سياسة الإلغاء والاسترجاع", "Cancellation & refunds"], ["policy.html#platform", "سياسة استخدام المنصة", "Platform use"], ["policy.html#map", "سياسة استخدام الخريطة التفاعلية", "Interactive map use"]])}
        <div><h4>${L("معلومات عامة", "General")}</h4><ul>
          <li><a href="faq.html">${L("الأسئلة الشائعة", "FAQ")}</a></li><li><a href="contact.html">${L("تواصل معنا", "Contact us")}</a></li><li><a href="help.html">${L("مركز المساعدة", "Help center")}</a></li>
          <li style="margin-top:8px"><span style="font-size:13px">${L("طرق الدفع", "Payment methods")}</span><div class="pay-row" style="margin-top:8px"><span>VISA</span><span>Mastercard</span><span>mada</span><span>Apple Pay</span><span>${L("تحويل بنكي", "Bank transfer")}</span></div></li>
        </ul></div>
      </div>
      <div class="ftr-bottom">
        <img src="assets/logo-light.png" alt="Bali Trips" style="height:26px;width:auto">
        <span>© 2026 Bali Trips LLC. ${L("جميع الحقوق محفوظة.", "All rights reserved.")}</span>
        <span class="num" style="opacity:.7">${L("نسخة الموقع", "Site version")} 2.0 · prototype</span>
      </div>
    </div>
  </footer>`;
}

function updateBadges() {
  const n = Trip.count(); document.querySelectorAll("[data-trip-badge]").forEach(b => { b.textContent = n; b.hidden = n === 0; });
  const f = Fav.all().length; document.querySelectorAll("[data-fav-badge]").forEach(b => { b.textContent = f; b.hidden = f === 0; });
}

function protoPill() {
  if (document.body.dataset.noproto != null) return;
  const a = document.createElement("a"); a.className = "proto-pill"; a.href = "index.html";
  a.innerHTML = `${icon("layers", 14, 2.2)} ${L("نموذج أولي · بيانات تجريبية", "Prototype · demo data")}`; document.body.appendChild(a);
}

/* ---------------- Card renderers ---------------- */
function favBtn(id) { return `<button class="fav-btn" data-fav="${id}" aria-pressed="${Fav.has(id)}" aria-label="${L("أضف إلى المفضلة", "Save to favorites")}">${icon("heart", 19, 2)}</button>`; }
function stars(r, count) { return `<span class="stars">${starIcon(14)} ${r.toFixed(1)}${count ? `<span class="muted" style="font-weight:500">(${count})</span>` : ""}</span>`; }
function activityCard(a) {
  const cat = D.ACT_CATS.find(c => c[0] === a.cats[0]);
  return `<a class="card rv" href="activity.html#${a.id}" data-id="${a.id}">
    <div class="card-media"><img src="${img(a.img)}" alt="" loading="lazy"><div class="tl"><span class="tag tag-glass">${t(cat[1])}</span></div><div class="tr">${favBtn("act:" + a.id)}</div></div>
    <div class="card-body">
      <div class="row between" style="gap:8px"><span class="card-meta"><span>${icon("pin", 15)} ${t(region(a.region).name)}</span><span>${icon("clock", 15)} ${t(a.duration)}</span></span>${stars(a.rating, a.reviews)}</div>
      <h3 class="card-title">${t(a.title)}</h3>
      <p class="muted" style="font-size:14.5px">${t(a.short)}</p>
      <div class="card-foot">
        <div class="from"><small>${L("يبدأ من", "From")}</small><b class="price">${money(a.priceFrom)} <em>/ ${L("للشخص", "person")}</em></b></div>
        <span class="row" style="gap:6px"><span class="btn btn-ghost btn-sm" data-quickadd="${a.id}" role="button" tabindex="0" aria-label="${L("أضف إلى رحلتي", "Add to My Trip")}">${icon("plus", 16)} ${L("رحلتي", "Trip")}</span><span class="btn btn-forest btn-sm">${L("التفاصيل", "Details")}</span></span>
      </div>
    </div></a>`;
}
function itineraryCard(it) {
  return `<a class="card rv" href="itinerary.html#${it.id}">
    <div class="card-media" style="aspect-ratio:5/4"><img src="${img(it.img)}" alt="" loading="lazy"><div class="tl"><span class="tag tag-glass">${icon("cal", 14)} ${BT.cnt(it.days, "d")}</span>${it.popular ? `<span class="tag" style="background:var(--orange);color:var(--forest-ink)">${L("مقترح للزيارة الأولى", "Best first trip")}</span>` : ""}</div><div class="tr">${favBtn("iti:" + it.id)}</div></div>
    <div class="card-body">
      <h3 class="card-title">${t(it.name)}</h3>
      <p class="muted" style="font-size:14.5px">${t(it.short)}</p>
      <div class="card-meta"><span>${icon("pin", 15)} ${it.regions.map(r => t(region(r).name)).join(L("، ", ", "))}</span></div>
      <div class="card-foot"><div class="from"><small>${L("ملف PDF + خريطة", "PDF + map")}</small><b class="price">${money(it.price)}</b></div>
      <span class="row" style="gap:6px"><span class="btn btn-ghost btn-sm">${L("التفاصيل", "Details")}</span><span class="btn btn-primary btn-sm" data-buy-iti="${it.id}" role="button" tabindex="0">${L("شراء الجدول", "Buy")}</span></span></div>
    </div></a>`;
}
function packageCard(p) {
  return `<a class="card rv" href="package.html#${p.id}">
    <div class="card-media" style="aspect-ratio:16/11"><img src="${img(p.img)}" alt="" loading="lazy"><div class="tl"><span class="tag tag-glass">${t(p.theme)}</span></div><div class="tr">${favBtn("pkg:" + p.id)}</div></div>
    <div class="card-body">
      <h3 class="card-title">${t(p.name)}</h3>
      <div class="card-meta"><span>${icon("cal", 15)} ${BT.cnt(p.days, "d")}</span><span>${icon("users", 15)} ${p.people === 2 && BT.LANG === "ar" ? "لشخصين" : L("حتى", "Up to") + " " + BT.cnt(p.people, "p")}</span><span>${icon("car", 15)} ${p.driver ? L("يشمل السائق", "Driver included") : L("بدون سائق", "No driver")}</span></div>
      <p class="muted" style="font-size:14.5px">${t(p.short)}</p>
      <div class="card-foot"><div class="from"><small>${L("يبدأ من", "From")}</small><b class="price">${money(p.price)}</b></div><span class="btn btn-forest btn-sm">${L("التفاصيل", "Details")} ${icon("arrow", 16)}</span></div>
    </div></a>`;
}
function regionCard(r, tall) {
  return `<a class="card rv region-card" href="region.html#${r.id}" style="aspect-ratio:${tall ? "3/4" : "4/3"};border:0">
    <img src="${img(r.img.replace("assets/img/", "").replace(".jpg", ""))}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
    <span style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(19,48,26,.85))"></span>
    <span style="position:absolute;inset-inline:18px;bottom:16px;color:#fff;display:flex;flex-direction:column;gap:2px">
      <b style="font-size:22px">${t(r.name)}</b><span style="font-size:14px;opacity:.9">${t(r.tag)}</span>
      <span style="font-size:13px;font-weight:700;color:var(--palm);display:inline-flex;gap:6px;align-items:center;margin-top:4px">${L("استكشف المنطقة", "Explore area")} ${icon("arrow", 15)}</span>
    </span></a>`;
}
function articleCard(a) {
  return `<a class="card rv" href="article.html#${a.id}">
    <div class="card-media" style="aspect-ratio:16/10"><img src="${img(a.img)}" alt="" loading="lazy"></div>
    <div class="card-body"><div class="row" style="gap:8px"><span class="tag tag-palm">${t(a.cat)}</span><span class="muted" style="font-size:13px">${numAr(a.mins)} ${L("دقائق قراءة", "min read")}</span></div>
    <h3 class="card-title">${t(a.title)}</h3><p class="muted" style="font-size:14.5px">${t(a.ex)}</p>
    <span class="link" style="margin-top:auto;align-self:flex-start">${L("اقرأ المقال", "Read article")} ${icon("arrow", 15)}</span></div></a>`;
}
function placeCard(p) {
  const c = byId(D.CATS, p.cat);
  return `<a class="card rv" href="place.html#${p.id}">
    <div class="card-media"><img src="${img(p.img)}" alt="" loading="lazy"><div class="tl"><span class="tag tag-glass">${icon(c.icon, 14)} ${t(c.name)}</span></div><div class="tr">${favBtn("plc:" + p.id)}</div></div>
    <div class="card-body"><div class="row between"><span class="card-meta"><span>${icon("pin", 15)} ${t(region(p.region).name)}</span></span>${stars(p.rating)}</div>
    <h3 class="card-title">${t(p.name)}</h3><p class="muted" style="font-size:14.5px">${t(p.desc)}</p></div></a>`;
}
function crumbs(items) {
  return `<nav class="crumbs" aria-label="${L("مسار التنقل", "Breadcrumb")}">${items.map((it, i) => i === items.length - 1 ? `<span aria-current="page">${it[0]}</span>` : `<a href="${it[1]}">${it[0]}</a><span class="sep">${LANG === "ar" ? "‹" : "›"}</span>`).join("")}</nav>`;
}

/* Delegated interactions: favorites, quick add, buy itinerary */
document.addEventListener("click", (e) => {
  const f = e.target.closest("[data-fav]");
  if (f) { e.preventDefault(); e.stopPropagation(); const on = Fav.toggle(f.dataset.fav); f.setAttribute("aria-pressed", on); f.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 320 }); toast(on ? L("أُضيف إلى المفضلة", "Saved to favorites") : L("أُزيل من المفضلة", "Removed from favorites"), on ? { link: [L("عرض المفضلة", "View"), "account.html#favorites"] } : {}); return; }
  const q = e.target.closest("[data-quickadd]");
  if (q) { e.preventDefault(); e.stopPropagation(); location.href = "activity.html#" + q.dataset.quickadd + "/book"; return; }
  const b = e.target.closest("[data-buy-iti]");
  if (b) { e.preventDefault(); e.stopPropagation(); const it = byId(D.ITINERARIES, b.dataset.buyIti); addItinerary(it); return; }
});
function addItinerary(it, go) {
  if (Trip.items().some(i => i.type === "itinerary" && i.ref === it.id)) { toast(L("هذا الجدول موجود في رحلتك", "Already in your trip"), { link: [L("رحلتي", "My Trip"), "my-trip.html"] }); return; }
  Trip.add({ type: "itinerary", ref: it.id, title: it.name, img: it.img, lines: [{ l: { ar: `ملف جدول ${it.days} أيام (PDF)`, en: `${it.days}-day itinerary file (PDF)` }, v: it.price }], total: it.price, meta: { days: it.days } });
  if (go) location.href = "my-trip.html"; else toast(L("أُضيف الجدول إلى رحلتي", "Itinerary added to My Trip"), { link: [L("رحلتي", "My Trip"), "my-trip.html"] });
}

/* Generic helpers for pages */
function mount(sel, htmlStr) { const el = typeof sel === "string" ? document.querySelector(sel) : sel; if (el) { el.innerHTML = htmlStr; applyStatic(el); } return el; }
function boot() { renderHeader(); renderFooter(); renderTabbar(); protoPill(); applyStatic(); updateBadges(); }

window.BT = { cnt, cntAr, D, LANG, t, L, money, numAr, esc, img, icon, starIcon, fmtDate, byId, region, hashId, Trip, Fav, Auth, MapAccess, store, toast, crumbs, mount, applyStatic, activityCard, itineraryCard, packageCard, regionCard, articleCard, placeCard, stars, favBtn, addItinerary, boot, setLang };
})();
