/* ============================================================
   HOME — ordered per the final platform spec.
   Hero+stats · intro · 5 sections · driver · activities · map ·
   packages · itineraries · how it works · landmarks · loved ·
   reviews · articles
   ============================================================ */

/* 2 — hero banner (image or video) with stats inside */
const HomeHero = () => {
  const { t, lang, navigate } = useBT();
  const stats = [["500+", "ab_stat1"], ["9", "ab_stat2"], ["4.9★", "ab_stat3"], ["12k+", "ab_stat4"]];
  return (
    <section className="bt-hero" data-screen-label="Hero">
      <Photo src={flickr("bali,ocean,cliff", 1800, 1100, 2)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div className="bt-hero-veil"></div>
      <div className="wrap bt-hero-inner">
        <div className="eyebrow" style={{ color: "var(--palm)" }}><span style={{ width: 18, height: 2, background: "var(--palm)", borderRadius: 2 }}></span>{t("hero_kicker")}</div>
        <h1 className="display" style={{ color: "#fff", marginTop: 16 }}>{t("hero_title_1")}<br />{t("hero_title_2")}</h1>
        <p className="lede" style={{ color: "rgba(255,255,255,0.9)", marginTop: 18, maxWidth: "52ch" }}>{t("hero_sub")}</p>
        <div className="row" style={{ gap: 12, marginTop: 28 }}>
          <button className="btn btn-orange" onClick={() => navigate("map")}><Icon name="pin" size={18} color="#fff" /> {t("hero_cta_1")}</button>
          <button className="btn btn-light" onClick={() => navigate("custom")}><Icon name="sparkle" size={18} color="var(--forest)" /> {t("hero_cta_2")}</button>
        </div>
        <div className="bt-hero-stats">
          {stats.map(([v, k]) => <div key={k} className="bt-hero-stat"><span className="bt-hero-stat-v">{v}</span><span className="bt-hero-stat-l">{t(k)}</span></div>)}
        </div>
      </div>
    </section>
  );
};

/* 3 — platform intro */
const HomeIntro = () => {
  const { t } = useBT();
  return (
    <section className="bg-ivory">
      <div className="wrap center" style={{ maxWidth: 760 }}>
        <span className="bt-intro-badge" style={{ margin: "0 auto 18px" }}><Icon name="compass" size={22} color="var(--orange-deep)" /></span>
        <h2 className="section-title" style={{ fontSize: "clamp(24px,4vw,38px)" }}>{t("ab_hero_t")}</h2>
        <p className="lede" style={{ marginTop: 14 }}>{t("about_p1")}</p>
      </div>
    </section>
  );
};

/* 4 — the five platform sections */
const HomeSections = () => {
  const { t } = useBT();
  const secs = [
    { icon: "car",     tk: "navr_driver2", bk: "svc_drv_b",  img: "bali,road,jungle",  to: "driver" },
    { icon: "compass", tk: "svc_act_t",    bk: "svc_act_b",  img: "uluwatu,temple",    to: "activities" },
    { icon: "pin",     tk: "svc_map_t",    bk: "svc_map_b",  img: "tegallalang,rice",  to: "map" },
    { icon: "star",    tk: "svc_pkg_t",    bk: "svc_pkg_b",  img: "seminyak,beach",    to: "packages" },
    { icon: "cal",     tk: "svc_itin_t",   bk: "svc_itin_b", img: "lempuyang,temple",  to: "itineraries" },
  ];
  return (
    <section className="bg-ivory-2" data-screen-label="Platform sections">
      <div className="wrap">
        <Head t={t} eyebrow="hs_eyebrow" title="hs_title" center />
        <div className="bt-fivegrid">
          {secs.map((s, i) => <ServiceCard key={s.to} icon={s.icon} title={t(s.tk)} body={t(s.bk)} image={s.img} seed={20 + i} to={s.to} />)}
        </div>
      </div>
    </section>
  );
};

/* 5 — driver section with inline booking */
const HomeDriver = () => {
  const { t, lang, navigate } = useBT();
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [pax, setPax] = React.useState(2);
  const [area, setArea] = React.useState("south");
  const veh = vehicleFor(pax);
  const vehKey = { sedan: "dp_veh_sedan", suv: "dp_veh_suv", van: "dp_veh_van" }[veh];
  const vehIcon = { sedan: "car", suv: "suv", van: "van" }[veh];
  const feats = ["dp_vp1", "dp_vp2", "dp_vp3", "dp_vp5"];
  return (
    <section className="bg-forest" data-screen-label="Driver">
      <div className="wrap bt-hdriver">
        <div>
          <div className="eyebrow" style={{ color: "var(--palm)" }}><span style={{ width: 18, height: 2, background: "var(--palm)", borderRadius: 2 }}></span>{t("navr_driver2")}</div>
          <h2 className="section-title" style={{ color: "var(--ivory)", marginTop: 12 }}>{t("hd_title")}</h2>
          <p className="lede" style={{ marginTop: 14 }}>{t("hd_sub")}</p>
          <div className="bt-driverteaser-feats">
            {feats.map((k) => <span key={k} className="bt-dtf"><Icon name="check" size={15} color="var(--palm)" /> {t(k)}</span>)}
          </div>
        </div>
        <div className="bt-hdriver-form">
          <div className="bt-daterange">
            <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}><span className="bt-flabel">{t("dp_start")}</span><input type="date" className="bt-input" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}><span className="bt-flabel">{t("dp_end")}</span><input type="date" className="bt-input" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <div className="bt-daterange" style={{ marginTop: 14 }}>
            <div className="bt-field" style={{ flex: 1, marginBottom: 0 }}><span className="bt-flabel">{t("dp_pax")}</span><Stepper value={pax} set={setPax} min={1} max={20} /></div>
            <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}><span className="bt-flabel">{t("hd_pickup")}</span>
              <select className="bt-input" value={area} onChange={(e) => setArea(e.target.value)}>
                {Object.keys(REGIONS).map((k) => <option key={k} value={k}>{REGIONS[k][lang]}</option>)}
              </select>
            </label>
          </div>
          <div className="bt-vehicle" style={{ marginTop: 16, marginBottom: 0 }}>
            <span className="bt-vehicle-ic"><Icon name={vehIcon} size={26} color="var(--forest)" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{t("hd_vehtype")}</div>
              <div style={{ fontWeight: 800, fontSize: 15.5 }}>{t(vehKey)}</div>
            </div>
          </div>
          <button className="btn btn-orange btn-block" style={{ marginTop: 16 }} onClick={() => navigate("driver")}><Icon name="car" size={18} color="#fff" /> {t("hd_cta")}</button>
        </div>
      </div>
    </section>
  );
};

/* 6 — activities & events */
const HomeActivities = () => {
  const { t, lang, navigate } = useBT();
  const cats = ["marine", "adv", "culture", "family", "spa", "food", "romantic"];
  const feat = ["batur", "penida", "kecak", "snorkel", "spa", "sunsetdine"].map(findActivity).filter(Boolean);
  return (
    <section className="bg-ivory" data-screen-label="Activities">
      <div className="wrap">
        <Head t={t} eyebrow="ev_eyebrow" title="ha_title" center />
        <div className="bt-filterchips" style={{ justifyContent: "center", marginBottom: 28 }}>
          {cats.map((k) => (
            <button key={k} className="chip" onClick={() => navigate("activities", { cat: k })}>{(ACT_CATS.find((c) => c.key === k) || {}).label?.[lang]}</button>
          ))}
        </div>
        <div className="grid bt-grid-3auto">{feat.map((a) => <ActivityCard key={a.id} a={a} />)}</div>
        <div className="center" style={{ marginTop: 32 }}>
          <button className="btn btn-forest" onClick={() => navigate("activities")}>{t("ha_all")} <Icon name="arrow" size={17} color="#fff" className="flip" /></button>
        </div>
      </div>
    </section>
  );
};

/* 7 — interactive map (largest section) */
const HomeMap = () => {
  const { t, navigate } = useBT();
  const cats = ["hm_c1","hm_c2","hm_c3","hm_c4","hm_c5","hm_c6","hm_c7","hm_c8"];
  const icons = ["coffee","coffee","wave","pin","compass","tag","sparkle","route"];
  return (
    <section className="bg-ivory-2" data-screen-label="Interactive map">
      <div className="wrap">
        <Head t={t} eyebrow="map_eyebrow" title="hm_title" center />
        <p className="lede center" style={{ maxWidth: "70ch", margin: "0 auto 32px" }}>{t("hm_sub")}</p>
        <button className="bt-bigmap" onClick={() => navigate("map")}>
          <Photo src={flickr("tegallalang,rice", 1600, 900, 4)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          <span className="bt-bigmap-veil"></span>
          <span className="bt-bigmap-pins">
            {[[22,30],[38,58],[55,26],[68,64],[80,40],[46,80],[88,72],[14,64]].map(([x, y], i) => (
              <span key={i} className="bt-bigmap-pin" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.25}s` }}><Icon name="pin" size={16} color="#fff" /></span>
            ))}
          </span>
          <span className="bt-bigmap-cta"><span className="btn btn-orange" style={{ pointerEvents: "none" }}><Icon name="pin" size={18} color="#fff" /> {t("hm_cta")}</span></span>
        </button>
        <div className="bt-mapcats">
          {cats.map((k, i) => (
            <button key={k} className="bt-mapcat" onClick={() => navigate("map")}>
              <Icon name={icons[i]} size={19} color="var(--forest)" /><span>{t(k)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

/* 8 — ready packages */
const HomePackages = () => {
  const { t, navigate } = useBT();
  return (
    <section className="bg-ivory" data-screen-label="Packages">
      <div className="wrap">
        <Head t={t} eyebrow="tp_eyebrow" title="hp_title" center />
        <div className="grid bt-grid-3auto">{PACKAGES.map((p) => <PackageCard key={p.id} p={p} />)}</div>
      </div>
    </section>
  );
};

/* 9 — itineraries */
const HomeItineraries = () => {
  const { t, navigate } = useBT();
  return (
    <section className="bg-ivory-2" data-screen-label="Itineraries">
      <div className="wrap">
        <Head t={t} eyebrow="pkg_eyebrow" title="hi_title" center />
        <div className="grid bt-grid-4">{ITINERARIES.slice(0, 8).map((it) => <ItineraryCard key={it.id} it={it} />)}</div>
        <div className="center" style={{ marginTop: 32 }}>
          <button className="btn btn-forest" onClick={() => navigate("itineraries")}>{t("hi_all")} <Icon name="arrow" size={17} color="#fff" className="flip" /></button>
        </div>
      </div>
    </section>
  );
};

/* 10 — how it works */
const HomeHow = () => {
  const { t } = useBT();
  const steps = [["compass","hw_1"],["cal","hw_2"],["cart","hw_3"],["check","hw_4"]];
  return (
    <section className="bg-forest" data-screen-label="How it works">
      <div className="wrap">
        <div className="center" style={{ marginBottom: 40 }}>
          <h2 className="section-title" style={{ color: "var(--ivory)" }}>{t("hw_title")}</h2>
        </div>
        <div className="bt-howgrid">
          {steps.map(([ic, k], i) => (
            <div key={k} className="bt-howstep">
              <span className="bt-howstep-n">{i + 1}</span>
              <span className="bt-howstep-ic"><Icon name={ic} size={24} color="var(--palm)" /></span>
              <span className="bt-howstep-t">{t(k)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* 11 — landmarks */
const HomeLandmarks = () => {
  const { t, lang, navigate } = useBT();
  const [reg, setReg] = React.useState("all");
  const list = LANDMARKS.filter((l) => reg === "all" || l.region === reg);
  const regs = [{ key: "all", label: { en: t("hl_allregions"), ar: t("hl_allregions"), id: t("hl_allregions") } },
    ...Object.keys(REGIONS).map((k) => ({ key: k, label: REGIONS[k] }))];
  return (
    <section className="bg-ivory" data-screen-label="Landmarks">
      <div className="wrap">
        <Head t={t} eyebrow="places_eyebrow" title="hl_title" center />
        <div className="bt-filterchips" style={{ justifyContent: "center", marginBottom: 28 }}>
          {regs.map((r) => <button key={r.key} onClick={() => setReg(r.key)} className={`chip ${reg === r.key ? "active" : ""}`}>{r.label[lang]}</button>)}
        </div>
        <div className="grid bt-grid-3auto">
          {list.map((l, i) => <LandmarkCard key={l.id} l={l} seed={60 + i} />)}
        </div>
      </div>
    </section>
  );
};

/* 12 — travelers love */
const HomeLoved = () => {
  const { t, lang, navigate } = useBT();
  const [sel, setSel] = React.useState(LOVED[0].key);
  const list = ACTIVITIES.filter((a) => a.cats.includes(sel)).sort((a, b) => b.rating - a.rating).slice(0, 3);
  return (
    <section className="bg-ivory-2" data-screen-label="Travelers love">
      <div className="wrap">
        <Head t={t} eyebrow="rev_eyebrow" title="hv_title" center />
        <div className="bt-filterchips" style={{ justifyContent: "center", marginBottom: 28 }}>
          {LOVED.map((c) => (
            <button key={c.key} onClick={() => setSel(c.key)} className={`chip ${sel === c.key ? "active" : ""}`}>
              <Icon name={c.ic} size={15} color={sel === c.key ? "#fff" : "var(--forest)"} /> {c.label[lang]}
            </button>
          ))}
        </div>
        <div className="grid bt-grid-3auto">{list.map((a) => <ActivityCard key={a.id} a={a} />)}</div>
      </div>
    </section>
  );
};

/* 13 — reviews */
const HomeReviews = () => {
  const { t } = useBT();
  return (
    <section className="bg-ivory" data-screen-label="Reviews">
      <div className="wrap"><Head t={t} eyebrow="rev_eyebrow" title="hr_title" center /></div>
      <div className="wrap"><ReviewsBlock tags={["adv","family","culture","beach","food","nature"]} title="" showService /></div>
    </section>
  );
};

/* 14 — articles */
const HomeArticles = () => {
  const { t, navigate } = useBT();
  return (
    <section className="bg-ivory-2" data-screen-label="Articles">
      <div className="wrap">
        <div className="bt-sec-head">
          <Head t={t} eyebrow="art_eyebrow" title="hb_title" />
          <button className="btn btn-ghost bt-seeall" onClick={() => navigate("blog")}>{t("c_seeall")} <Icon name="arrow" size={16} className="flip" /></button>
        </div>
        <div className="grid bt-grid-3auto">{ARTICLES.slice(0, 3).map((a) => <ArticleCard key={a.id} a={a} />)}</div>
      </div>
    </section>
  );
};

const HomePage = () => (
  <React.Fragment>
    <HomeHero />
    <HomeIntro />
    <HomeSections />
    <HomeDriver />
    <HomeActivities />
    <HomeMap />
    <HomePackages />
    <HomeItineraries />
    <HomeHow />
    <HomeLandmarks />
    <HomeLoved />
    <HomeReviews />
    <HomeArticles />
  </React.Fragment>
);

Object.assign(window, { HomePage });
