/* ============================================================
   ITINERARIES (hub + detail)  +  PACKAGES (hub + detail)
   ============================================================ */

/* ---------- ITINERARIES HUB ---------- */
const ItinerariesPage = () => {
  const { t } = useBT();
  return (
    <React.Fragment>
      <PageBanner image="lempuyang,temple" seed={11} tag={t("pkg_eyebrow")} title={t("ih_title")} subtitle={t("ih_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("svc_itin_t") }]} />
      <section className="bg-ivory">
        <div className="wrap"><div className="grid bt-grid-4">{ITINERARIES.map((it) => <ItineraryCard key={it.id} it={it} />)}</div></div>
      </section>
    </React.Fragment>
  );
};

/* ---------- ITINERARY DETAIL ---------- */
const ItineraryDetailPage = ({ params }) => {
  const { t, lang, navigate, addToTrip, toast } = useBT();
  const it = findItinerary(params.id) || ITINERARIES[0];
  React.useEffect(() => window.scrollTo(0, 0), [params.id]);
  const acts = it.acts.map(findActivity).filter(Boolean);

  // build a day-by-day plan: seed each day with an activity, fill the rest as leisure
  const dayPlan = Array.from({ length: it.days }, (_, i) => {
    const a = acts[i];
    return a ? { d: i + 1, act: a } : { d: i + 1, act: null };
  });

  return (
    <React.Fragment>
      <div className="bt-detailwrap">
        <div className="wrap"><Breadcrumbs trail={[{ label: t("c_home"), to: "home" }, { label: t("svc_itin_t"), to: "itineraries" }, { label: it.name[lang] }]} /></div>
        <div className="wrap bt-detail-grid">
          <div className="bt-detail-main">
            <div className="bt-slider" style={{ borderRadius: "var(--r-lg)" }}>
              <Photo src={flickr(it.flickr, 1200, 700, it.days + 6)} alt={it.name[lang]} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              <div className="bt-dt-hero-veil"></div>
              <div style={{ position: "absolute", insetInline: 0, bottom: 0, padding: 28 }}>
                <span className="tag" style={{ background: "var(--orange)", color: "#fff" }}>{it.days} {t("c_days")}</span>
                <h1 style={{ fontSize: "clamp(26px,4.5vw,40px)", color: "#fff", marginTop: 10 }}>{it.name[lang]}</h1>
              </div>
            </div>

            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("id_overview")}</h2>
              <p className="lede" style={{ fontSize: 16 }}>{it.blurb[lang]}</p>
            </div>

            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("id_audience")}</h2>
              <div className="row" style={{ gap: 8 }}>{it.audience.map((au, i) => <span key={i} className="tag tag-forest">{au[lang]}</span>)}</div>
            </div>

            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("id_daybyday")}</h2>
              <div className="bt-timeline">
                {dayPlan.map((d) => (
                  <div key={d.d} className="bt-tl-item">
                    <span className="bt-tl-day">{t("dt_day_n") || "Day"} {d.d}</span>
                    {d.act ? (
                      <button className="bt-tl-card" onClick={() => navigate("activity", { id: d.act.id })}>
                        <Photo src={flickr(d.act.flickr, 200, 200, d.d + 3)} alt="" radius={10} style={{ width: 56, height: 56, flexShrink: 0 }} />
                        <span style={{ textAlign: "start", flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 700, fontSize: 14.5, display: "block" }}>{d.act.name[lang]}</span>
                          <span className="muted" style={{ fontSize: 12.5 }}><Icon name="pin" size={12} color="var(--muted)" /> {d.act.area[lang]}</span>
                        </span>
                        <Icon name="chevronr" size={16} color="var(--muted)" className="flip" />
                      </button>
                    ) : (
                      <div className="bt-tl-rest">{lang === "ar" ? "يوم حر للاستكشاف والراحة" : lang === "id" ? "Hari bebas untuk eksplorasi & santai" : "Free day to explore & relax"}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("id_pins")}</h2>
              <div className="row" style={{ gap: 8 }}>
                {acts.map((a) => <button key={a.id} className="chip" onClick={() => navigate("activity", { id: a.id })}><Icon name="pin" size={14} color="var(--orange-deep)" /> {a.name[lang]}</button>)}
              </div>
            </div>
          </div>

          {/* buy sidebar */}
          <aside className="bt-booking">
            <div className="bt-booking-price"><span style={{ fontSize: 32, fontWeight: 800, color: "var(--orange-deep)" }}>${it.price}</span></div>
            <div className="bt-summary" style={{ marginTop: 4 }}>
              <div className="bt-summary-t">{t("id_delivery")}</div>
              {["id_del1","id_del2","id_del3","id_del4"].map((k) => (
                <div key={k} className="bt-summary-row" style={{ alignItems: "flex-start" }}><span className="bt-check yes" style={{ marginTop: 2 }}><Icon name="check" size={13} color="var(--forest)" /></span><span style={{ flex: 1, fontSize: 13.5 }}>{t(k)}</span></div>
              ))}
            </div>
            <button className="btn btn-orange btn-block" style={{ marginTop: 14 }} onClick={() => { addToTrip(mkItinerary(it)); toast(t("c_added")); }}>{t("ih_buy")}</button>
            <button className="btn btn-forest btn-block" style={{ marginTop: 10 }} onClick={() => { addToTrip(mkItinerary(it)); navigate("cart"); }}>{t("c_book")}</button>
          </aside>
        </div>
      </div>
    </React.Fragment>
  );
};

/* ---------- PACKAGES HUB ---------- */
const PackagesPage = () => {
  const { t } = useBT();
  return (
    <React.Fragment>
      <PageBanner image="seminyak,beach" seed={13} tag={t("tp_eyebrow")} title={t("ph_title")} subtitle={t("ph_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("svc_pkg_t") }]} />
      <section className="bg-ivory">
        <div className="wrap"><div className="grid bt-grid-tp">{PACKAGES.map((p) => <PackageCard key={p.id} p={p} />)}</div></div>
      </section>
    </React.Fragment>
  );
};

/* ---------- PACKAGE DETAIL ---------- */
const PackageDetailPage = ({ params }) => {
  const { t, lang, navigate, addToTrip, toast } = useBT();
  const p = findPackage(params.id) || PACKAGES[0];
  const [guests, setGuests] = React.useState(2);
  const [date, setDate] = React.useState("");
  React.useEffect(() => { window.scrollTo(0, 0); setGuests(2); setDate(""); }, [params.id]);
  const acts = p.acts.map(findActivity).filter(Boolean);
  const inc = ["pd_pinc1","pd_pinc2","pd_pinc3","pd_pinc4"];
  const exc = ["ad_exc1","ad_exc2","ad_exc3"];

  return (
    <div className="bt-detailwrap">
      <div className="wrap"><Breadcrumbs trail={[{ label: t("c_home"), to: "home" }, { label: t("svc_pkg_t"), to: "packages" }, { label: p.name[lang] }]} /></div>
      <div className="wrap bt-detail-grid">
        <div className="bt-detail-main">
          <div className="bt-slider" style={{ borderRadius: "var(--r-lg)" }}>
            <Photo src={flickr(p.flickr, 1200, 700, p.days + 9)} alt={p.name[lang]} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            <div className="bt-dt-hero-veil"></div>
            <div style={{ position: "absolute", insetInline: 0, bottom: 0, padding: 28 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="tag" style={{ background: "var(--orange)", color: "#fff" }}>{p.days} {t("c_days")}</span>
                {p.driver && <span className="tag tag-palm"><Icon name="car" size={13} /> {t("pd_driver_inc")}</span>}
              </div>
              <h1 style={{ fontSize: "clamp(26px,4.5vw,40px)", color: "#fff", marginTop: 10 }}>{p.name[lang]}</h1>
            </div>
          </div>

          <div className="bt-detail-block">
            <h2 className="bt-detail-h">{t("id_overview")}</h2>
            <p className="lede" style={{ fontSize: 16 }}>{p.blurb[lang]}</p>
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <span className="tag tag-forest"><Icon name="cal" size={13} /> {p.days} {t("c_days")}</span>
              <span className="tag tag-forest"><Icon name="users" size={13} /> {t("ph_maxg")} {p.maxGuests} {t("ph_guests")}</span>
              {p.driver && <span className="tag tag-orange"><Icon name="car" size={13} /> {t("pd_driver_inc")}</span>}
            </div>
          </div>

          <div className="bt-incexc">
            <div><h2 className="bt-detail-h">{t("pd_inc")}</h2><ul className="bt-checklist">{inc.map((k) => <li key={k}><span className="bt-check yes"><Icon name="check" size={14} color="var(--forest)" /></span>{t(k)}</li>)}</ul></div>
            <div><h2 className="bt-detail-h">{t("pd_exc")}</h2><ul className="bt-checklist">{exc.map((k) => <li key={k}><span className="bt-check no"><Icon name="cross" size={13} color="var(--orange-deep)" /></span>{t(k)}</li>)}</ul></div>
          </div>

          <div className="bt-detail-block">
            <h2 className="bt-detail-h">{t("pd_roadmap")}</h2>
            <div className="grid bt-grid-3auto">{acts.map((a) => <ActivityCard key={a.id} a={a} />)}</div>
          </div>
        </div>

        <aside className="bt-booking">
          <div className="bt-booking-price"><span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{t("c_from")}</span><span style={{ fontSize: 30, fontWeight: 800, color: "var(--orange-deep)" }}>${p.price}</span></div>
          <div className="bt-field"><div className="bt-flabel">{t("c_date")}</div><input type="date" className="bt-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="bt-field"><div className="bt-flabel">{t("ad_guests")} ({t("ph_maxg")} {p.maxGuests})</div><Stepper value={guests} set={setGuests} min={1} max={p.maxGuests} /></div>
          <div className="bt-summary">
            <SummaryRow label={t("c_date")} value={date || "—"} />
            <SummaryRow label={t("c_guests")} value={guests} />
            <div className="bt-summary-total"><span>{t("c_total")}</span><span>${p.price}</span></div>
          </div>
          <button className="btn btn-orange btn-block" style={{ marginTop: 14 }} onClick={() => { addToTrip(mkPackage(p, { guests, date })); toast(t("c_added")); }}><Icon name="plus" size={17} color="#fff" /> {t("pd_checkout")}</button>
          <button className="btn btn-forest btn-block" style={{ marginTop: 10 }} onClick={() => { addToTrip(mkPackage(p, { guests, date })); navigate("cart"); }}>{t("c_book")}</button>
        </aside>
      </div>
    </div>
  );
};

Object.assign(window, { ItinerariesPage, ItineraryDetailPage, PackagesPage, PackageDetailPage });
