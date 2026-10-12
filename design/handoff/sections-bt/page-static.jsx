/* ============================================================
   SERVICES catalog (6 pillars) + ABOUT brand page
   ============================================================ */

const ServicesPage = () => {
  const { t, lang } = useBT();
  const svcs = [
    { icon: "pin",     tk: "svc_map_t",  bk: "svc_map_b",  img: "tegallalang,rice",     to: "map" },
    { icon: "compass", tk: "svc_act_t",  bk: "svc_act_b",  img: "uluwatu,temple",       to: "activities" },
    { icon: "car",     tk: "svc_drv_t",  bk: "svc_drv_b",  img: "bali,road,jungle",     to: "driver" },
    { icon: "cal",     tk: "svc_itin_t", bk: "svc_itin_b", img: "lempuyang,temple",     to: "itineraries" },
    { icon: "star",    tk: "svc_pkg_t",  bk: "svc_pkg_b",  img: "seminyak,beach",       to: "packages" },
    { icon: "sparkle", tk: "svc_cust_t", bk: "svc_cust_b", img: "nusa-penida,beach",    to: "custom" },
  ];
  return (
    <React.Fragment>
      <PageBanner image="bali,landscape,ocean" seed={7} tag={t("services_eyebrow")} title={t("svc_title")} subtitle={t("svc_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_services") }]} />
      <section className="bg-ivory">
        <div className="wrap">
          <div className="grid bt-grid-3auto">
            {svcs.map((s, i) => (
              <ServiceCard key={s.to} icon={s.icon} title={t(s.tk)} body={t(s.bk)} image={s.img} seed={20 + i} to={s.to} cta={t("c_startplan")} />
            ))}
          </div>
        </div>
      </section>
    </React.Fragment>
  );
};

const SubscriptionsPage = () => {
  const { t, lang, navigate, mapUnlocked, unlockMap, toast } = useBT();
  const choose = () => { unlockMap(); toast(t("mp_unlocked")); navigate("map"); };
  const tiers = [
    { id: "free", price: 0, ic: "compass", tk: "sub_free_t", bk: "sub_free_b",
      feats: [L("Browse all activities","تصفّح كل الأنشطة","Jelajahi semua aktivitas"), L("Free map preview","معاينة مجانية للخريطة","Pratinjau peta gratis"), L("Read every article","اقرأ كل المقالات","Baca semua artikel")],
      current: true },
    { id: "map", price: 19, ic: "pin", tk: "sub_map_t", bk: "sub_map_b", best: true,
      feats: [L("Everything in Explorer","كل ما في المستكشف","Semua di Explorer"), L("Full interactive map unlocked","الخريطة التفاعلية كاملة","Peta interaktif penuh"), L("Hours, photos & ratings for every pin","ساعات وصور وتقييمات لكل نقطة","Jam, foto & rating tiap pin"), L("Save places to your trip","احفظ الأماكن في رحلتك","Simpan tempat ke trip")],
      active: mapUnlocked },
    { id: "vip", price: 39, ic: "gem", tk: "sub_vip_t", bk: "sub_vip_b",
      feats: [L("Everything in Map Access","كل ما في وصول الخريطة","Semua di Akses Peta"), L("Hidden Gems & VIP-only places","الكنوز الخفية وأماكن VIP","Permata tersembunyi & tempat VIP"), L("Priority WhatsApp support","دعم واتساب بأولوية","Dukungan WhatsApp prioritas"), L("Seasonal itinerary updates","تحديثات موسمية للجداول","Pembaruan itinerari musiman")] },
  ];
  return (
    <React.Fragment>
      <PageBanner image="tegallalang,rice" seed={17} tag={t("sub_eyebrow")} title={t("sub_title")} subtitle={t("sub_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("acct_nav_subs") }]} />
      <section className="bg-ivory">
        <div className="wrap">
          <div className="bt-plangrid">
            {tiers.map((p) => (
              <div key={p.id} className={`bt-plan ${p.best ? "best" : ""}`}>
                {p.best && <span className="bt-plan-badge">{t("sub_best")}</span>}
                <span className="bt-plan-ic"><Icon name={p.ic} size={24} color={p.best ? "#fff" : "var(--forest)"} /></span>
                <h3 style={{ fontSize: 22, marginTop: 12 }}>{t(p.tk)}</h3>
                <p className="muted" style={{ fontSize: 13.5, margin: "6px 0 0", minHeight: 38 }}>{t(p.bk)}</p>
                <div className="bt-plan-price">{p.price === 0 ? <span style={{ fontSize: 30, fontWeight: 800 }}>{lang === "ar" ? "مجاني" : lang === "id" ? "Gratis" : "Free"}</span> : <React.Fragment><span style={{ fontSize: 34, fontWeight: 800, color: "var(--orange-deep)" }}>${p.price}</span> <span className="muted" style={{ fontSize: 13 }}>· {t("sub_once")}</span></React.Fragment>}</div>
                <ul className="bt-checklist" style={{ margin: "18px 0 22px" }}>
                  {p.feats.map((f, i) => <li key={i}><span className="bt-check yes"><Icon name="check" size={14} color="var(--forest)" /></span>{f[lang]}</li>)}
                </ul>
                {p.current ? (
                  <button className="btn btn-ghost btn-block" disabled style={{ opacity: .7, cursor: "default" }}>{t("sub_current")}</button>
                ) : p.active ? (
                  <button className="btn btn-forest btn-block" disabled style={{ cursor: "default" }}><Icon name="check" size={16} color="#fff" /> {t("sub_active")}</button>
                ) : (
                  <button className={`btn ${p.best ? "btn-orange" : "btn-forest"} btn-block`} onClick={choose}><Icon name="lock" size={16} color="#fff" /> {t("sub_choose")}</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </React.Fragment>
  );
};

const AboutPage = () => {
  const { t, lang } = useBT();
  const stats = [["500+", "ab_stat1"], ["9", "ab_stat2"], ["4.9★", "ab_stat3"], ["12k+", "ab_stat4"]];
  const values = [["shield","ab_v1_t","ab_v1_b"],["heart","ab_v2_t","ab_v2_b"],["compass","ab_v3_t","ab_v3_b"]];
  const wall = ["uluwatu,temple","tegallalang,rice","canggu,beach","nusa-penida,beach","lempuyang,temple","bali,waterfall"];
  return (
    <React.Fragment>
      <PageBanner image="ubud,jungle" seed={8} tag={t("about_eyebrow")} title={t("ab_hero_t")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_about") }]} />
      <section className="bg-ivory">
        <div className="wrap bt-about2">
          <div>
            <div className="eyebrow"><span style={{ width: 18, height: 2, background: "var(--orange)", borderRadius: 2 }}></span>{t("ab_story_t")}</div>
            <p className="lede" style={{ marginTop: 16 }}>{t("about_p1")}</p>
            <p className="lede" style={{ marginTop: 14 }}>{t("about_p2")}</p>
            <div className="bt-vm">
              <div className="card card-pad">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}><span className="bt-vm-ic" style={{ background: "var(--palm-soft)" }}><Icon name="compass" size={18} color="var(--forest)" /></span><h3 style={{ fontSize: 17 }}>{t("about_vision_t")}</h3></div>
                <p className="muted" style={{ fontSize: 14, margin: 0 }}>{t("about_vision")}</p>
              </div>
              <div className="card card-pad">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}><span className="bt-vm-ic" style={{ background: "rgba(255,144,0,0.16)" }}><Icon name="sparkle" size={18} color="var(--orange-deep)" /></span><h3 style={{ fontSize: 17 }}>{t("about_mission_t")}</h3></div>
                <p className="muted" style={{ fontSize: 14, margin: 0 }}>{t("about_mission")}</p>
              </div>
            </div>
          </div>
          <div className="bt-about2-wall">{wall.map((f, i) => <Photo key={i} src={flickr(f, 500, 500, 70 + i)} alt="" radius={16} style={{ height: i % 3 === 0 ? 220 : 160 }} />)}</div>
        </div>
      </section>

      <section className="bg-forest">
        <div className="wrap center">
          <h2 className="section-title" style={{ color: "var(--ivory)" }}>{t("ab_why_t")}</h2>
          <p className="lede" style={{ maxWidth: "60ch", margin: "16px auto 0" }}>{t("ab_why_b")}</p>
        </div>
      </section>

      <section className="bg-ivory">
        <div className="wrap">
          <Head t={t} eyebrow="ab_values_t" title="ab_values_t" center />
          <div className="grid bt-grid-3auto">
            {values.map(([ic, tk, bk]) => (
              <div key={tk} className="card card-pad center" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--palm-soft)", display: "grid", placeItems: "center" }}><Icon name={ic} size={26} color="var(--forest)" /></span>
                <h3 style={{ fontSize: 19 }}>{t(tk)}</h3>
                <p className="muted" style={{ fontSize: 14, margin: 0 }}>{t(bk)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ivory-2">
        <div className="wrap">
          <Head t={t} eyebrow="ab_trust_t" title="ab_trust_t" center />
          <div className="bt-statrow" style={{ marginTop: 0 }}>
            {stats.map(([v, k]) => <div key={k} className="bt-stat"><div className="bt-stat-v">{v}</div><div className="bt-stat-l">{t(k)}</div></div>)}
          </div>
        </div>
      </section>

      <section className="bg-ivory"><div className="wrap"><ReviewsBlock tags={["adv","family","culture","beach","food","nature"]} title={t("rev_title")} /></div></section>
    </React.Fragment>
  );
};

Object.assign(window, { ServicesPage, AboutPage, SubscriptionsPage });
