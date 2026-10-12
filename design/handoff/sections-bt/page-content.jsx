/* ============================================================
   CUSTOM trip proposal engine · BLOG hub · ARTICLE detail
   ============================================================ */

const WA_NUMBER = "9665481656544666"; // placeholder — swap for real number

/* ---------- CUSTOM TRIP ---------- */
const CustomPage = () => {
  const { t, lang, navigate, addToTrip, toast } = useBT();
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [pax, setPax] = React.useState(2);
  const [theme, setTheme] = React.useState("family");
  const [budget, setBudget] = React.useState(800);
  const [ints, setInts] = React.useState(["beach", "nature"]);
  const [driver, setDriver] = React.useState(true);
  const [notes, setNotes] = React.useState("");
  const [done, setDone] = React.useState(false);

  const themes = [["family","ct_type_family"],["honey","ct_type_honey"],["youth","ct_type_youth"],["solo","ct_type_solo"]];
  const interests = [["adv","compass"],["beach","wave"],["food","coffee"],["nature","mountain"],["culture","star"],["family","users"]];
  const toggleInt = (k) => setInts((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]);

  const recs = ACTIVITIES.filter((a) => a.cats.some((c) => ints.includes(c))).slice(0, 4);
  const recsFinal = recs.length ? recs : ACTIVITIES.slice(0, 4);

  const waText = encodeURIComponent(`Hi Bali Trips! Custom trip request:\n• Dates: ${start || "?"} → ${end || "?"}\n• Travelers: ${pax}\n• Theme: ${theme}\n• Budget/person: $${budget}\n• Interests: ${ints.join(", ")}\n• Driver: ${driver ? "yes" : "no"}\n• Notes: ${notes}`);
  const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

  const addAll = () => { recsFinal.forEach((a) => addToTrip(mkActivity(a, { qty: pax, date: start }))); if (driver) addToTrip(mkDriver({ days: 1, pax, veh: vehicleFor(pax), date: start })); toast(t("c_added")); navigate("cart"); };

  return (
    <React.Fragment>
      <PageBanner image="nusa-penida,beach" seed={14} tag={t("svc_cust_t")} title={t("cp_title")} subtitle={t("cp_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("svc_cust_t") }]} />
      <section className="bg-ivory">
        <div className="wrap" style={{ maxWidth: 900 }}>
          {!done ? (
            <div className="bt-form">
              <div className="bt-form-group">
                <h3 className="bt-form-q">{t("cp_when")}</h3>
                <div className="bt-daterange">
                  <label className="bt-field" style={{ flex: 1 }}><span className="bt-flabel">{t("dp_start")}</span><input type="date" className="bt-input" value={start} onChange={(e) => setStart(e.target.value)} /></label>
                  <label className="bt-field" style={{ flex: 1 }}><span className="bt-flabel">{t("dp_end")}</span><input type="date" className="bt-input" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
                </div>
              </div>
              <div className="bt-form-group">
                <h3 className="bt-form-q">{t("cp_pax")}</h3>
                <Stepper value={pax} set={setPax} min={1} max={20} />
              </div>
              <div className="bt-form-group">
                <h3 className="bt-form-q">{t("cp_theme")}</h3>
                <div className="bt-ct-row">{themes.map(([k, key]) => <button key={k} type="button" className={`bt-ct-pick ${theme === k ? "on" : ""}`} onClick={() => setTheme(k)}>{t(key)}</button>)}</div>
              </div>
              <div className="bt-form-group">
                <h3 className="bt-form-q">{t("cp_budget")}</h3>
                <div className="bt-slider-wrap">
                  <input type="range" min="200" max="3000" step="50" value={budget} onChange={(e) => setBudget(+e.target.value)} className="bt-range" />
                  <div className="bt-range-val">${budget}<span className="muted" style={{ fontSize: 13, fontWeight: 500 }}> / {t("c_pp")}</span></div>
                </div>
              </div>
              <div className="bt-form-group">
                <h3 className="bt-form-q">{t("cp_acts")}</h3>
                <div className="bt-ct-row">
                  {interests.map(([k, ic]) => (
                    <button key={k} type="button" className={`bt-ct-pick bt-ct-int ${ints.includes(k) ? "on" : ""}`} onClick={() => toggleInt(k)}>
                      <Icon name={ic} size={16} color={ints.includes(k) ? "#fff" : "var(--forest-soft)"} /> {(ACT_CATS.find((c) => c.key === k) || {}).label?.[lang]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bt-form-group">
                <button type="button" onClick={() => setDriver(!driver)} className={`bt-toggle ${driver ? "on" : ""}`} style={{ maxWidth: 420 }}>
                  <span className="bt-toggle-sw"></span>
                  <span style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}><Icon name="car" size={16} color="var(--forest)" /> {t("cp_driver")}</span>
                </button>
              </div>
              <div className="bt-form-group">
                <h3 className="bt-form-q">{t("cp_notes")}</h3>
                <textarea className="bt-input" style={{ minHeight: 110, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("cp_notes_ph")} />
              </div>
              <button className="btn btn-orange" style={{ alignSelf: "flex-start" }} onClick={() => { setDone(true); window.scrollTo(0, 0); }}>{t("cp_submit")} <Icon name="arrow" size={18} color="#fff" className="flip" /></button>
            </div>
          ) : (
            <div className="bt-form">
              <div>
                <div className="eyebrow"><span style={{ width: 18, height: 2, background: "var(--orange)", borderRadius: 2 }}></span>{t("cp_recs_t")}</div>
                <h2 className="section-title" style={{ fontSize: "clamp(26px,4.5vw,40px)", marginTop: 10 }}>{t("cp_recs_t")}</h2>
                <p className="lede" style={{ marginTop: 12 }}>{t("cp_recs_b")}</p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {start && <span className="tag tag-forest">{start}{end ? ` → ${end}` : ""}</span>}
                <span className="tag tag-forest">{pax} {t("c_guests")}</span>
                <span className="tag tag-forest">${budget} / {t("c_pp")}</span>
                {ints.map((k) => <span key={k} className="tag tag-palm">{(ACT_CATS.find((c) => c.key === k) || {}).label?.[lang]}</span>)}
                {driver && <span className="tag tag-orange"><Icon name="car" size={12} /> {t("dp_title")}</span>}
              </div>
              <div className="grid bt-grid-4">{recsFinal.map((a) => <ActivityCard key={a.id} a={a} />)}</div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-forest" onClick={addAll}><Icon name="plus" size={17} color="#fff" /> {t("cp_addall")}</button>
                <a href={waLink} target="_blank" rel="noopener" className="btn btn-orange"><Icon name="whatsapp" size={18} color="#fff" /> {t("cp_wa")}</a>
                <button className="btn btn-ghost" onClick={() => setDone(false)}>{t("cp_again")}</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </React.Fragment>
  );
};

/* ---------- BLOG HUB ---------- */
const BlogPage = () => {
  const { t, lang } = useBT();
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const ql = q.trim().toLowerCase();
  const list = ARTICLES.filter((a) => (cat === "all" || a.cat === cat) && (!ql || a.title[lang].toLowerCase().includes(ql) || a.title.en.toLowerCase().includes(ql)));
  const mostRead = ARTICLES.slice(0, 4);

  return (
    <React.Fragment>
      <PageBanner image="canggu,beach" seed={16} tag={t("art_eyebrow")} title={t("bh_title")} subtitle={t("bh_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_blog") }]} />
      <section className="bg-ivory">
        <div className="wrap bt-blog-grid">
          <div>
            <div className="bt-blog-controls">
              <div className="bt-mapsearch" style={{ background: "var(--white)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--line)", maxWidth: "none" }}>
                <Icon name="search" size={18} color="var(--muted)" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("bh_search")} style={{ color: "var(--forest)" }} />
              </div>
              <div className="bt-filterchips">{BLOG_CATS.map((c) => <button key={c.key} onClick={() => setCat(c.key)} className={`chip ${cat === c.key ? "active" : ""}`} style={{ minHeight: 40 }}>{c.label[lang]}</button>)}</div>
            </div>
            <div className="grid bt-grid-2" style={{ marginTop: 24 }}>{list.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
            {list.length === 0 && <div className="muted" style={{ padding: "40px 0", textAlign: "center" }}>{t("c_search_empty")}</div>}
          </div>
          <aside className="bt-blog-side">
            <div className="card card-pad">
              <h3 style={{ fontSize: 18, marginBottom: 14 }}>{t("bh_mostread")}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{mostRead.map((a) => <ArticleCard key={a.id} a={a} compact />)}</div>
            </div>
          </aside>
        </div>
      </section>
    </React.Fragment>
  );
};

/* ---------- ARTICLE DETAIL ---------- */
const bodyParas = (lang) => ({
  en: ["Bali rewards the traveler who plans a little and then lets go. The island is small enough to cross in a few hours, yet dense enough that every valley, beach and village feels like its own world.",
    "Start with where you'll sleep — the south for surf and nightlife, the centre for culture, the east and north for quiet. From there, everything else falls into place, especially once you have the map and a driver sorted.",
    "Whatever you choose, build in slack. The best Bali memories rarely come from the itinerary — they come from the warung you stumbled on, the ceremony you were waved into, the road that turned out to be the view."],
  ar: ["تكافئ بالي المسافر الذي يخطّط قليلًا ثم يترك نفسه للتجربة. الجزيرة صغيرة بما يكفي لعبورها في ساعات، لكنها غنية لدرجة أن كل وادٍ وشاطئ وقرية يبدو عالمًا مستقلًا.",
    "ابدأ باختيار مكان إقامتك — الجنوب للأمواج والحياة الليلية، والوسط للثقافة، والشرق والشمال للهدوء. من هناك يترتّب كل شيء، خاصة بعد تجهيز الخريطة والسائق.",
    "مهما اخترت، اترك مساحة للعفوية. أجمل ذكريات بالي نادرًا ما تأتي من الجدول — بل من المطعم الصغير الذي صادفته، والاحتفال الذي دُعيت إليه، والطريق الذي تحوّل إلى إطلالة."],
  id: ["Bali memberi imbalan bagi yang merencanakan sedikit lalu membiarkannya mengalir. Pulau ini cukup kecil untuk diseberangi beberapa jam, namun cukup padat hingga tiap lembah, pantai, dan desa terasa seperti dunia sendiri.",
    "Mulai dari tempat menginap — selatan untuk ombak dan hiburan malam, tengah untuk budaya, timur dan utara untuk ketenangan. Dari situ semuanya jatuh pada tempatnya, apalagi setelah peta dan sopir siap.",
    "Apa pun pilihan Anda, sisakan ruang. Kenangan terbaik Bali jarang datang dari itinerari — melainkan dari warung yang tak sengaja ditemukan, upacara yang mengajak Anda masuk, jalan yang ternyata pemandangan."],
}[lang]);

const ArticleDetailPage = ({ params }) => {
  const { t, lang, navigate } = useBT();
  const a = findArticle(params.id) || ARTICLES[0];
  React.useEffect(() => window.scrollTo(0, 0), [params.id]);
  const related = (a.related || []).map(findArticle).filter(Boolean);
  const bridgeKey = { map: "ar_bridge_map", activities: "ar_bridge_act", driver: "ar_bridge_driver" }[a.bridge] || "ar_bridge_map";
  const paras = bodyParas(lang);

  return (
    <div className="bt-detailwrap">
      <div className="wrap"><Breadcrumbs trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_blog"), to: "blog" }, { label: a.title[lang] }]} /></div>
      <div className="wrap" style={{ maxWidth: 820 }}>
        <div className="bt-slider" style={{ borderRadius: "var(--r-lg)", height: 360 }}>
          <Photo src={flickr(a.flickr, 1200, 700, a.id.length + 12)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        </div>
        <div className="row" style={{ gap: 10, marginTop: 22 }}>
          <span className="tag tag-palm">{(BLOG_CATS.find((c) => c.key === a.cat) || {}).label?.[lang]}</span>
          <span className="muted" style={{ fontSize: 13 }}>{a.read}</span>
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,44px)", marginTop: 14 }}>{a.title[lang]}</h1>
        <p className="lede" style={{ marginTop: 16, fontWeight: 500 }}>{a.excerpt[lang]}</p>
        <div className="bt-article-body">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>

        {/* service bridge CTA */}
        <button className="bt-bridge" onClick={() => navigate(a.bridge === "activities" ? "activities" : a.bridge)}>
          <Icon name={a.bridge === "driver" ? "car" : a.bridge === "activities" ? "compass" : "pin"} size={24} color="#fff" />
          <span style={{ flex: 1, textAlign: "start", fontWeight: 800, fontSize: 18 }}>{t(bridgeKey)}</span>
          <Icon name="arrow" size={20} color="#fff" className="flip" />
        </button>
      </div>

      {related.length > 0 && (
        <div className="wrap">
          <section className="bt-related">
            <h3 className="bt-related-h">{t("ar_related")}</h3>
            <div className="grid bt-grid-3auto">{related.map((r) => <ArticleCard key={r.id} a={r} />)}</div>
          </section>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { CustomPage, BlogPage, ArticleDetailPage, WA_NUMBER });
