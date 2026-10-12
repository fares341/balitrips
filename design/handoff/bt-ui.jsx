/* ============================================================
   BALI TRIPS — Shared UI + app context (router/store consumer).
   BT context is provided by bt-app.jsx; every page reads it via useBT().
   ============================================================ */

const BT = React.createContext(null);
const useBT = () => React.useContext(BT);

/* ---- cart item builders (unified shape) ---- */
const uid = (k) => k + "-" + Math.random().toString(36).slice(2, 8);
const mkActivity = (a, { qty = 1, date = "", time = "" } = {}) => ({
  id: uid("act"), kind: "activity", refId: a.id, name: a.name, flickr: a.flickr,
  price: a.price, qty, date, time,
  meta: L(`${qty} guest${qty > 1 ? "s" : ""}${date ? " · " + date : ""}${time ? " · " + time : ""}`,
          `${qty} أفراد${date ? " · " + date : ""}${time ? " · " + time : ""}`,
          `${qty} tamu${date ? " · " + date : ""}${time ? " · " + time : ""}`),
});
const mkDriver = ({ days = 1, pax = 2, veh = "sedan", date = "" } = {}) => {
  const rate = veh === "van" ? 95 : veh === "suv" ? 70 : 45;
  const vk = { sedan: "dp_veh_sedan", suv: "dp_veh_suv", van: "dp_veh_van" }[veh];
  return {
    id: uid("drv"), kind: "driver", refId: "driver", flickr: "bali,road,jungle",
    price: rate, qty: days, vehKey: vk, pax, days, date,
    name: L("Private Driver", "سائق خاص", "Sopir Pribadi"),
    meta: L(`${days} day${days > 1 ? "s" : ""} · ${pax} pax`, `${days} أيام · ${pax} أشخاص`, `${days} hari · ${pax} orang`),
  };
};
const mkItinerary = (it) => ({
  id: uid("itin"), kind: "itinerary", refId: it.id, name: it.name, flickr: it.flickr,
  price: it.price, qty: 1, meta: L(`${it.days}-day plan`, `خطة ${it.days} أيام`, `Rencana ${it.days} hari`),
});
const mkPackage = (p, { guests = 2, date = "" } = {}) => ({
  id: uid("pkg"), kind: "package", refId: p.id, name: p.name, flickr: p.flickr,
  price: p.price, qty: 1, meta: L(`${p.days} days · ${guests} guests${date ? " · " + date : ""}`,
    `${p.days} أيام · ${guests} أفراد${date ? " · " + date : ""}`, `${p.days} hari · ${guests} tamu${date ? " · " + date : ""}`),
});
const mkPlace = (pl) => ({
  id: uid("place"), kind: "place", refId: pl.id, name: pl.name, flickr: pl.flickr,
  price: 0, qty: 1, meta: pl.cat,
});

/* ---- small pieces ---- */
const Rating = ({ value, count, light }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: light ? "#fff" : "var(--forest)" }}>
    <span style={{ color: "var(--orange)" }}>★</span>{value}
    {count != null && <span className="muted" style={{ fontWeight: 500, color: light ? "rgba(255,255,255,.75)" : "var(--muted)" }}>({count})</span>}
  </span>
);

const Stepper = ({ value, set, min = 1, max = 30, sm }) => (
  <div className={`bt-stepper ${sm ? "bt-stepper-sm" : ""}`}>
    <button type="button" onClick={() => set(Math.max(min, value - 1))} aria-label="minus"><Icon name="minus" size={sm ? 13 : 16} /></button>
    <span>{value}</span>
    <button type="button" onClick={() => set(Math.min(max, value + 1))} aria-label="plus"><Icon name="plus" size={sm ? 13 : 16} /></button>
  </div>
);

/* ---- unified page banner ---- */
const PageBanner = ({ image, seed = 2, tag, title, subtitle, trail, children, tall }) => {
  const { t } = useBT();
  return (
    <div className={`bt-banner ${tall ? "tall" : ""}`}>
      <Photo src={flickr(image || "bali,landscape", 1600, 700, seed)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div className="bt-banner-veil"></div>
      <div className="wrap bt-banner-inner">
        {trail && <Breadcrumbs trail={trail} light />}
        {tag && <span className="tag" style={{ background: "var(--orange)", color: "#fff", width: "fit-content" }}>{tag}</span>}
        <h1 className="bt-banner-title">{title}</h1>
        {subtitle && <p className="bt-banner-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
};

/* ---- breadcrumbs ---- */
const Breadcrumbs = ({ trail, light }) => {
  const { navigate } = useBT();
  return (
    <nav className={`bt-crumbs ${light ? "light" : ""}`} aria-label="Breadcrumb">
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <React.Fragment key={i}>
            {last ? <span className="bt-crumb-cur">{c.label}</span> :
              <button type="button" className="bt-crumb-link" onClick={() => navigate(c.to, c.params)}>{c.label}</button>}
            {!last && <Icon name="chevronr" size={13} className="flip" />}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

/* ---- filter bar (uniform) ---- */
const FilterBar = ({ items, active, onChange, sorts, sort, onSort }) => {
  const { lang } = useBT();
  return (
    <div className="bt-filterbar">
      <div className="bt-filterchips">
        {items.map((f) => (
          <button key={f.key} onClick={() => onChange(f.key)} className={`chip ${active === f.key ? "active" : ""}`} style={{ minHeight: 42 }}>{f.label[lang]}</button>
        ))}
      </div>
      {sorts && (
        <div className="bt-filtersort">
          <Icon name="filter" size={16} color="var(--muted)" />
          {sorts.map((s) => (
            <button key={s.key} onClick={() => onSort(s.key === sort ? null : s.key)} className={`chip orange ${sort === s.key ? "active" : ""}`} style={{ minHeight: 42 }}>{s.label[lang]}</button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---- cards (all clickable → route) ---- */
const ActivityCard = ({ a }) => {
  const { t, lang, navigate, addToTrip, toast } = useBT();
  return (
    <article className="card bt-cardhover" style={{ display: "flex", flexDirection: "column" }}>
      <button className="bt-card-media" onClick={() => navigate("activity", { id: a.id })} aria-label={a.name[lang]}>
        <Photo src={flickr(a.flickr, 700, 500, a.id.length + 3)} alt={a.name[lang]} style={{ height: 190 }} />
        <span className="bt-card-badge">{(ACT_CATS.find((c) => c.key === a.cats[0]) || {}).label?.[lang]}</span>
        <span className="bt-card-rate">★ {a.rating}</span>
      </button>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <button onClick={() => navigate("activity", { id: a.id })} style={{ background: "none", border: 0, padding: 0, textAlign: "start", cursor: "pointer" }}>
          <h3 style={{ fontSize: 18, color: "var(--forest)" }}>{a.name[lang]}</h3>
        </button>
        <div className="muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="pin" size={13} color="var(--muted)" /> {a.area[lang]}<span>·</span><Icon name="clock" size={13} color="var(--muted)" /> {a.dur[lang]}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", paddingTop: 10 }}>
          <div>
            <span className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{t("c_from")}</span>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--orange-deep)" }}>${a.price}<span className="muted" style={{ fontSize: 12, fontWeight: 600 }}> {t("c_pp")}</span></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn btn-forest" style={{ flex: 1, minHeight: 42, fontSize: 13.5, padding: "10px" }} onClick={() => navigate("activity", { id: a.id })}>{t("c_view")}</button>
          <button className="btn btn-ghost" style={{ minHeight: 42, fontSize: 13.5, padding: "10px 14px" }} onClick={() => { addToTrip(mkActivity(a)); toast(t("c_added")); }} aria-label={t("c_addtrip")}><Icon name="plus" size={16} /></button>
        </div>
      </div>
    </article>
  );
};

const ItineraryCard = ({ it }) => {
  const { t, lang, navigate, addToTrip, toast } = useBT();
  return (
    <article className="card bt-cardhover" style={{ display: "flex", flexDirection: "column" }}>
      <button className="bt-card-media" onClick={() => navigate("itinerary", { id: it.id })} aria-label={it.name[lang]}>
        <Photo src={flickr(it.flickr, 700, 500, it.days + 6)} alt={it.name[lang]} style={{ height: 180 }} />
        <span className="bt-card-badge" style={{ background: "var(--orange)", color: "#fff" }}>{it.days} {t("c_days")}</span>
      </button>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <h3 style={{ fontSize: 19 }}>{it.name[lang]}</h3>
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>{it.blurb[lang]}</p>
        {it.regions && <div className="row" style={{ gap: 6 }}>{it.regions.slice(0, 3).map((r) => <span key={r} className="tag tag-forest" style={{ fontSize: 10.5 }}>{(REGIONS[r] || {})[lang]}</span>)}</div>}
        <div className="bt-itin-meta">
          {it.spots != null && <span><Icon name="pin" size={13} color="var(--muted)" /> {it.spots} {t("hi_spots")}</span>}
          {it.type && <span><Icon name="tag" size={13} color="var(--muted)" /> {it.type[lang]}</span>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: "auto", paddingTop: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--orange-deep)" }}>${it.price}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1, minHeight: 42, fontSize: 12.5, padding: "9px 10px" }} onClick={() => navigate("itinerary", { id: it.id })}>{t("c_view")}</button>
          <button className="btn btn-orange" style={{ flex: 1, minHeight: 42, fontSize: 12.5, padding: "9px 10px" }} onClick={() => { addToTrip(mkItinerary(it)); toast(t("c_added")); }}>{t("hi_buy")}</button>
        </div>
      </div>
    </article>
  );
};

const LandmarkCard = ({ l, seed = 60 }) => {
  const { t, lang, navigate } = useBT();
  const go = () => l.actId ? navigate("activity", { id: l.actId }) : navigate("map");
  return (
    <article className="card bt-cardhover" style={{ display: "flex", flexDirection: "column" }}>
      <button className="bt-card-media" onClick={go} aria-label={l.name[lang]}>
        <Photo src={flickr(l.flickr, 700, 500, seed)} alt={l.name[lang]} style={{ height: 190 }} />
        <span className="bt-card-badge">{(REGIONS[l.region] || {})[lang]}</span>
      </button>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <h3 style={{ fontSize: 19 }}>{l.name[lang]}</h3>
        <span className="tag tag-palm" style={{ width: "fit-content" }}>{l.type[lang]}</span>
        <p className="muted" style={{ fontSize: 13.5, margin: 0, flex: 1 }}>{l.blurb[lang]}</p>
        <button className="btn btn-forest" style={{ marginTop: 6, minHeight: 44, fontSize: 13.5 }} onClick={go}>{t("hl_cta")} <Icon name="arrow" size={15} color="#fff" className="flip" /></button>
      </div>
    </article>
  );
};

const PackageCard = ({ p }) => {
  const { t, lang, navigate } = useBT();
  return (
    <article className="card bt-cardhover" style={{ display: "flex", flexDirection: "column" }}>
      <button className="bt-card-media" onClick={() => navigate("package", { id: p.id })} aria-label={p.name[lang]}>
        <Photo src={flickr(p.flickr, 700, 500, p.days + 9)} alt={p.name[lang]} style={{ height: 200 }} />
        <span className="bt-card-veil2"></span>
        <span style={{ position: "absolute", insetInlineStart: 16, bottom: 14, color: "#fff", fontSize: 22, fontWeight: 800 }}>{p.name[lang]}</span>
      </button>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>{p.blurb[lang]}</p>
        <div className="row" style={{ gap: 8 }}>
          <span className="tag tag-forest"><Icon name="cal" size={13} /> {p.days} {t("c_days")}</span>
          <span className="tag tag-palm"><Icon name="users" size={13} /> {t("ph_maxg")} {p.maxGuests}</span>
          {p.driver && <span className="tag tag-orange"><Icon name="car" size={13} /> {t("dp_title")}</span>}
        </div>
        {p.regions && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{t("hp_regions")}:</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{p.regions.map((r) => (REGIONS[r] || {})[lang]).join(" · ")}</span>
          </div>
        )}
        {p.amenities && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{t("hp_services")}:</span>
            <span style={{ display: "flex", gap: 6 }}>{p.amenities.map((am) => <span key={am} className="bt-amen"><Icon name={am} size={14} color="var(--forest)" /></span>)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: "auto", paddingTop: 8 }}>
          <div><span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{t("c_from")} </span><span style={{ fontSize: 22, fontWeight: 800, color: "var(--orange-deep)" }}>${p.price}</span></div>
          <button className="btn btn-forest" style={{ minHeight: 42, fontSize: 13.5, padding: "10px 16px" }} onClick={() => navigate("package", { id: p.id })}>{t("hp_view")}</button>
        </div>
      </div>
    </article>
  );
};

const ArticleCard = ({ a, compact }) => {
  const { t, lang, navigate } = useBT();
  if (compact) return (
    <button className="bt-article-mini" onClick={() => navigate("article", { id: a.id })}>
      <Photo src={flickr(a.flickr, 200, 200, a.id.length + 12)} alt="" radius={10} style={{ width: 64, height: 64, flexShrink: 0 }} />
      <span style={{ textAlign: "start" }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, display: "block", color: "var(--forest)" }}>{a.title[lang]}</span>
        <span className="muted" style={{ fontSize: 12 }}>{a.read}</span>
      </span>
    </button>
  );
  return (
    <article className="card bt-cardhover" style={{ display: "flex", flexDirection: "column" }}>
      <button className="bt-card-media" onClick={() => navigate("article", { id: a.id })} aria-label={a.title[lang]}>
        <Photo src={flickr(a.flickr, 700, 460, a.id.length + 12)} alt={a.title[lang]} style={{ height: 190 }} />
      </button>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="tag tag-palm">{(BLOG_CATS.find((c) => c.key === a.cat) || {}).label?.[lang]}</span>
          <span className="muted" style={{ fontSize: 12.5 }}>{a.read}</span>
        </div>
        <button onClick={() => navigate("article", { id: a.id })} style={{ background: "none", border: 0, padding: 0, textAlign: "start", cursor: "pointer" }}>
          <h3 style={{ fontSize: 20, lineHeight: 1.2, color: "var(--forest)" }}>{a.title[lang]}</h3>
        </button>
        <p className="muted" style={{ fontSize: 13.5, margin: 0, flex: 1 }}>{a.excerpt[lang]}</p>
        <span style={{ color: "var(--orange-deep)", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>{t("bh_read")} <Icon name="arrow" size={15} color="var(--orange-deep)" className="flip" /></span>
      </div>
    </article>
  );
};

const ServiceCard = ({ icon, title, body, image, seed, to, params, cta }) => {
  const { t, navigate } = useBT();
  return (
    <button className="card bt-svc-card bt-cardhover" onClick={() => navigate(to, params)} style={{ textAlign: "start", padding: 0, overflow: "hidden", cursor: "pointer" }}>
      <div className="bt-card-media" style={{ width: "100%" }}>
        <Photo src={flickr(image, 700, 400, seed)} alt="" style={{ height: 150 }} />
        <span className="bt-svc-icon"><Icon name={icon} size={22} color="#fff" /></span>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <h3 style={{ fontSize: 20 }}>{title}</h3>
        <p className="muted" style={{ fontSize: 14, margin: 0, flex: 1 }}>{body}</p>
        <span className="bt-svc-more">{cta || t("c_more")} <Icon name="arrow" size={15} color="var(--orange-deep)" className="flip" /></span>
      </div>
    </button>
  );
};

/* ---- contextual cross-sell blocks ---- */
const RelatedActivities = ({ excludeId }) => {
  const { t } = useBT();
  const list = similarActivities(excludeId, 3);
  if (!list.length) return null;
  return (
    <section className="bt-related">
      <h3 className="bt-related-h">{t("ad_similar")}</h3>
      <div className="grid bt-grid-3auto">{list.map((a) => <ActivityCard key={a.id} a={a} />)}</div>
    </section>
  );
};
const SuggestBundles = ({ actId }) => {
  const { t } = useBT();
  const list = packagesWith(actId);
  if (!list.length) return null;
  return (
    <section className="bt-related">
      <h3 className="bt-related-h">{t("ad_bundles")}</h3>
      <div className="grid bt-grid-3auto">{list.map((p) => <PackageCard key={p.id} p={p} />)}</div>
    </section>
  );
};
const LinkedItineraries = ({ actId }) => {
  const { t } = useBT();
  const list = itinerariesWith(actId);
  if (!list.length) return null;
  return (
    <section className="bt-related">
      <h3 className="bt-related-h">{t("ad_initin")}</h3>
      <div className="grid bt-grid-3auto">{list.map((it) => <ItineraryCard key={it.id} it={it} />)}</div>
    </section>
  );
};

/* ---- per-page reviews ---- */
const ReviewsBlock = ({ tags, title, showService }) => {
  const { t, lang } = useBT();
  const list = reviewsFor(tags);
  const svcOf = (r) => {
    const k = r.tags.find((x) => ["adv","family","culture","beach","food","cafe","nature"].includes(x));
    return k === "family" ? t("svc_pkg_t") : k === "food" || k === "cafe" ? t("svc_act_t") : k === "nature" || k === "adv" ? t("svc_drv_t") : t("svc_itin_t");
  };
  return (
    <section className="bt-related">
      {title === "" ? null : <h3 className="bt-related-h">{title || t("ad_revtitle")}</h3>}
      <div className="hscroll" style={{ gap: 16 }}>
        {list.map((r, i) => (
          <div key={i} className="card card-pad" style={{ width: "min(84vw, 340px)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="stars" style={{ fontSize: 15 }}>{"★".repeat(r.stars)}<span style={{ color: "var(--line)" }}>{"★".repeat(5 - r.stars)}</span></div>
            <p style={{ fontSize: 15.5, lineHeight: 1.6, margin: 0, fontWeight: 500, flex: 1 }}>{r.text[lang]}</p>
            {showService && <span className="tag tag-palm" style={{ width: "fit-content", fontSize: 11 }}>{t("hr_used")}: {svcOf(r)}</span>}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,var(--forest),var(--forest-soft))", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800 }}>{r.name[0]}</span>
              <div><div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div><div className="muted" style={{ fontSize: 12 }}>{r.from[lang]}</div></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

/* ---- driver upsell interstitial ---- */
const DriverUpsell = ({ onAdd, onSkip }) => {
  const { t } = useBT();
  return (
    <div className="bt-modal-scrim" onClick={onSkip}>
      <div className="bt-upsell" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="bt-upsell-icon"><Icon name="car" size={30} color="var(--forest)" /></div>
        <h3 style={{ fontSize: 24, textAlign: "center" }}>{t("up_title")}</h3>
        <p className="muted" style={{ textAlign: "center", fontSize: 15, margin: "10px 0 22px", lineHeight: 1.6 }}>{t("up_body")}</p>
        <button className="btn btn-orange btn-block" onClick={onAdd}><Icon name="plus" size={17} color="#fff" /> {t("up_add")}</button>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onSkip}>{t("up_no")}</button>
      </div>
    </div>
  );
};

/* ---- site-wide search overlay ---- */
const SearchOverlay = ({ onClose }) => {
  const { t, lang, navigate } = useBT();
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current && inputRef.current.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []);
  const ql = q.trim().toLowerCase();
  const hits = ql.length < 1 ? [] : [
    ...ACTIVITIES.filter((a) => a.name[lang].toLowerCase().includes(ql) || a.name.en.toLowerCase().includes(ql) || a.area[lang].toLowerCase().includes(ql)).map((a) => ({ type: "activity", id: a.id, title: a.name[lang], sub: a.area[lang], flickr: a.flickr, route: "activity" })),
    ...MAP_PLACES.filter((p) => p.name[lang].toLowerCase().includes(ql) || p.name.en.toLowerCase().includes(ql)).map((p) => ({ type: "place", id: p.id, title: p.name[lang], sub: p.cat[lang], flickr: p.flickr, route: "map" })),
    ...ITINERARIES.filter((it) => it.name[lang].toLowerCase().includes(ql) || it.name.en.toLowerCase().includes(ql)).map((it) => ({ type: "itinerary", id: it.id, title: it.name[lang], sub: `${it.days} ${t("c_days")}`, flickr: it.flickr, route: "itinerary" })),
    ...PACKAGES.filter((p) => p.name[lang].toLowerCase().includes(ql) || p.name.en.toLowerCase().includes(ql)).map((p) => ({ type: "package", id: p.id, title: p.name[lang], sub: `${p.days} ${t("c_days")}`, flickr: p.flickr, route: "package" })),
    ...ARTICLES.filter((a) => a.title[lang].toLowerCase().includes(ql) || a.title.en.toLowerCase().includes(ql)).map((a) => ({ type: "article", id: a.id, title: a.title[lang], sub: a.read, flickr: a.flickr, route: "article" })),
  ].slice(0, 12);
  const go = (h) => { navigate(h.route, { id: h.id }); onClose(); };
  return (
    <div className="bt-search-scrim" onClick={onClose}>
      <div className="bt-search" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="bt-search-bar">
          <Icon name="search" size={22} color="var(--muted)" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("c_search")} />
          <button className="bt-modal-x" style={{ position: "static" }} onClick={onClose}><Icon name="cross" size={20} /></button>
        </div>
        <div className="bt-search-results">
          {ql.length >= 1 && hits.length === 0 && <div className="muted" style={{ padding: "24px 4px", textAlign: "center" }}>{t("c_search_empty")}</div>}
          {hits.map((h) => (
            <button key={h.type + h.id} className="bt-search-hit" onClick={() => go(h)}>
              <Photo src={flickr(h.flickr, 120, 120, 5)} alt="" radius={10} style={{ width: 48, height: 48, flexShrink: 0 }} />
              <span style={{ textAlign: "start", flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14.5, display: "block" }}>{h.title}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{h.sub}</span>
              </span>
              <span className="tag tag-forest" style={{ textTransform: "capitalize" }}>{t("ct2_grp_" + h.type) !== "ct2_grp_" + h.type ? t("ct2_grp_" + h.type) : h.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ---- toast ---- */
const Toast = ({ msg }) => (
  <div className="bt-toast" role="status"><Icon name="check" size={18} color="#fff" /> {msg}</div>
);

/* ---- 4-column footer ---- */
const Footer = () => {
  const { t, lang, navigate } = useBT();
  const nav = [["home","navr_home"],["services","navr_services"],["driver","navr_driver2"],["activities","navr_act"],["itineraries","navr_itin"],["map","navr_map"],["explore","navr_explore"],["plans","acct_nav_subs"],["blog","navr_blog"],["contact","navr_contact"]];
  const policies = ["ft_p_terms","ft_p_privacy","ft_p_refund","ft_p_cookies"];
  return (
    <footer className="bg-forest bt-footer">
      <div className="wrap">
        <div className="bt-foot-cols">
          <div className="bt-foot-brand">
            <div style={{ background: "var(--ivory)", display: "inline-block", padding: "10px 14px", borderRadius: 14 }}><Logo height={30} /></div>
            <p style={{ color: "rgba(255,251,248,0.8)", marginTop: 16, maxWidth: "38ch", lineHeight: 1.6 }}>{t("ft_brand_b")}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
              {["Instagram","TikTok","YouTube"].map((s) => <a key={s} href="#" style={{ color: "var(--palm)", fontSize: 13.5, fontWeight: 600 }}>{s}</a>)}
            </div>
          </div>
          <div className="bt-foot-col">
            <h4>{t("ft_nav")}</h4>
            {nav.map(([r, k]) => <button key={r} onClick={() => navigate(r)} className="bt-foot-link">{t(k)}</button>)}
          </div>
          <div className="bt-foot-col">
            <h4>{t("ft_policies")}</h4>
            {policies.map((k) => <a key={k} href="#" className="bt-foot-link">{t(k)}</a>)}
          </div>
          <div className="bt-foot-col">
            <h4>{t("ft_contact")}</h4>
            <span className="bt-foot-line"><Icon name="whatsapp" size={16} color="var(--palm)" /> +966 4815 654 4666</span>
            <a href="https://www.balitrips.com" className="bt-foot-line"><Icon name="globe" size={16} color="var(--palm)" /> www.balitrips.com</a>
            <span className="bt-foot-line"><Icon name="pin" size={16} color="var(--palm)" /> Bali · Jeddah, KSA</span>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: "rgba(255,251,248,0.6)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>{t("ft_pay")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["VISA","MC","Amex","Mada","Apple Pay"].map((p) => <span key={p} className="bt-pay">{p}</span>)}</div>
            </div>
          </div>
        </div>
        <div className="bt-foot-bottom">
          <span>© 2026 {t("foot_rights")}</span>
        </div>
      </div>
    </footer>
  );
};

Object.assign(window, {
  BT, useBT, uid, mkActivity, mkDriver, mkItinerary, mkPackage, mkPlace,
  Rating, Stepper, PageBanner, Breadcrumbs, FilterBar,
  ActivityCard, ItineraryCard, PackageCard, ArticleCard, ServiceCard, LandmarkCard,
  RelatedActivities, SuggestBundles, LinkedItineraries, ReviewsBlock,
  DriverUpsell, SearchOverlay, Toast, Footer,
});
