/* ============================================================
   ACTIVITIES hub  +  ACTIVITY detail (booking engine, driver
   cross-sell, live order summary, validation, contextual)
   ============================================================ */

/* ---------- HUB ---------- */
const ActivitiesPage = ({ params }) => {
  const { t, lang } = useBT();
  const [cat, setCat] = React.useState(params?.cat || "all");
  const [sort, setSort] = React.useState(null);
  React.useEffect(() => { if (params?.cat) setCat(params.cat); }, [params?.cat]);

  let list = ACTIVITIES.filter((a) => cat === "all" || a.cats.includes(cat));
  if (sort === "top") list = [...list].sort((a, b) => b.rating - a.rating);
  if (sort === "price") list = [...list].sort((a, b) => a.price - b.price);
  if (sort === "region") list = [...list].sort((a, b) => a.region.localeCompare(b.region));

  return (
    <React.Fragment>
      <PageBanner image="uluwatu,cliff" seed={9} tag={t("ev_eyebrow")} title={t("ah_title")} subtitle={t("ah_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_act") }]} />
      <section className="bg-ivory">
        <div className="wrap">
          <FilterBar items={ACT_CATS} active={cat} onChange={setCat} sorts={ACT_SORTS} sort={sort} onSort={setSort} />
          <div className="muted" style={{ fontSize: 13.5, fontWeight: 600, margin: "18px 0 20px" }}>{list.length} {t("ah_count")}</div>
          {list.length === 0 ? <div className="muted" style={{ padding: "40px 0", textAlign: "center" }}>{t("ah_none")}</div> :
            <div className="grid bt-grid-3auto">{list.map((a) => <ActivityCard key={a.id} a={a} />)}</div>}
        </div>
      </section>
    </React.Fragment>
  );
};

/* ---------- SLIDER ---------- */
const Slider = ({ images, alt, seedBase = 5 }) => {
  const [i, setI] = React.useState(0);
  const n = images.length;
  const go = (d) => setI((p) => (p + d + n) % n);
  return (
    <div className="bt-slider">
      {images.map((f, k) => (
        <Photo key={k} src={flickr(f, 1200, 720, seedBase + k)} alt={alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: k === i ? 1 : 0, transition: "opacity .4s" }} />
      ))}
      <button className="bt-slider-nav start" onClick={() => go(-1)} aria-label="prev"><Icon name="chevronr" size={22} color="#fff" style={{ transform: "rotate(180deg)" }} /></button>
      <button className="bt-slider-nav end" onClick={() => go(1)} aria-label="next"><Icon name="chevronr" size={22} color="#fff" /></button>
      <div className="bt-slider-dots">{images.map((_, k) => <button key={k} className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={"slide " + (k + 1)} />)}</div>
    </div>
  );
};

/* ---------- ACCORDION ---------- */
const Accordion = ({ items }) => {
  const [open, setOpen] = React.useState(0);
  return (
    <div className="bt-accordion">
      {items.map((it, i) => (
        <div key={i} className={`bt-acc-item ${open === i ? "on" : ""}`}>
          <button className="bt-acc-q" onClick={() => setOpen(open === i ? -1 : i)}>
            <span>{it.q}</span><Icon name="chevron" size={18} />
          </button>
          {open === i && <div className="bt-acc-a">{it.a}</div>}
        </div>
      ))}
    </div>
  );
};

/* ---------- DETAIL ---------- */
const ActivityDetailPage = ({ params }) => {
  const { t, lang, navigate, addToTrip, toast } = useBT();
  const a = findActivity(params.id) || ACTIVITIES[0];
  const [qty, setQty] = React.useState(2);
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [driver, setDriver] = React.useState(false);
  const [err, setErr] = React.useState({});
  const [upsell, setUpsell] = React.useState(false);

  React.useEffect(() => { window.scrollTo(0, 0); setDate(""); setTime(""); setDriver(false); setQty(2); setErr({}); }, [params.id]);

  const times = [ ["09:00", "am"], ["11:30", "am"], ["14:00", "pm"], ["16:30", "pm"] ];
  const veh = vehicleFor(qty);
  const driverRate = veh === "van" ? 95 : veh === "suv" ? 70 : 45;
  const base = a.price * qty;
  const total = base + (driver ? driverRate : 0);
  const included = ["ad_inc1","ad_inc2","ad_inc3","ad_inc4"];
  const excluded = ["ad_exc1","ad_exc2","ad_exc3"];
  const faq = [["ad_faq1_q","ad_faq1_a"],["ad_faq2_q","ad_faq2_a"],["ad_faq3_q","ad_faq3_a"]];

  const validate = () => {
    const e = {};
    if (!date) e.date = true;
    if (!time) e.time = true;
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const commit = (withDriver) => {
    addToTrip(mkActivity(a, { qty, date, time }));
    if (withDriver) addToTrip(mkDriver({ days: 1, pax: qty, veh, date }));
    toast(t("c_added"));
  };

  const onAddTrip = () => { if (!validate()) return; commit(driver); };
  const onBook = () => {
    if (!validate()) return;
    if (!driver) { setUpsell(true); return; }
    commit(true); navigate("cart");
  };

  return (
    <React.Fragment>
      <div className="bt-detailwrap">
        <div className="wrap">
          <Breadcrumbs trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_act"), to: "activities" }, { label: a.name[lang] }]} />
        </div>
        <div className="wrap bt-detail-grid">
          <div className="bt-detail-main">
            <Slider images={a.gallery} alt={a.name[lang]} seedBase={a.id.length + 4} />
            <div className="bt-detail-head">
              <div className="row" style={{ gap: 8 }}>
                {a.cats.slice(0, 3).map((c) => <span key={c} className="tag tag-forest">{(ACT_CATS.find((x) => x.key === c) || {}).label?.[lang]}</span>)}
              </div>
              <h1 style={{ fontSize: "clamp(28px,5vw,42px)", marginTop: 12 }}>{a.name[lang]}</h1>
              <div className="bt-detail-meta">
                <Rating value={a.rating} count={a.reviews} />
                <span><Icon name="pin" size={15} color="var(--muted)" /> {a.area[lang]}</span>
                <span><Icon name="clock" size={15} color="var(--muted)" /> {a.dur[lang]}</span>
              </div>
            </div>

            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("ad_about")}</h2>
              <p className="lede" style={{ fontSize: 16 }}>{a.desc[lang]}</p>
            </div>

            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("ad_gallery")}</h2>
              <div className="bt-gallery-grid">{a.gallery.map((g, i) => <Photo key={i} src={flickr(g, 400, 300, 40 + i)} alt="" radius={12} style={{ height: 120 }} />)}</div>
            </div>

            <div className="bt-incexc">
              <div>
                <h2 className="bt-detail-h">{t("ad_inc")}</h2>
                <ul className="bt-checklist">{included.map((k) => <li key={k}><span className="bt-check yes"><Icon name="check" size={14} color="var(--forest)" /></span>{t(k)}</li>)}</ul>
              </div>
              <div>
                <h2 className="bt-detail-h">{t("ad_exc")}</h2>
                <ul className="bt-checklist">{excluded.map((k) => <li key={k}><span className="bt-check no"><Icon name="cross" size={13} color="var(--orange-deep)" /></span>{t(k)}</li>)}</ul>
              </div>
            </div>

            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("ad_cancel")}</h2>
              <div className="bt-cancel"><Icon name="shield" size={20} color="var(--forest)" /><p className="muted" style={{ margin: 0, fontSize: 14.5 }}>{t("ad_cancel_b")}</p></div>
            </div>

            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("ad_faq")}</h2>
              <Accordion items={faq.map(([q, aK]) => ({ q: t(q), a: t(aK) }))} />
            </div>
          </div>

          {/* booking engine */}
          <aside className="bt-booking">
            <div className="bt-booking-price"><span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{t("c_from")}</span><span style={{ fontSize: 30, fontWeight: 800, color: "var(--orange-deep)" }}>${a.price}</span><span className="muted" style={{ fontSize: 13 }}>{t("c_pp")}</span></div>
            <h3 style={{ fontSize: 17, margin: "4px 0 14px" }}>{t("ad_book")}</h3>

            <div className="bt-field">
              <div className="bt-flabel">{t("ad_seldate")}</div>
              <input type="date" className={`bt-input ${err.date ? "bt-input-err" : ""}`} value={date} onChange={(e) => { setDate(e.target.value); setErr((p) => ({ ...p, date: false })); }} />
              {err.date && <div className="bt-errmsg"><Icon name="cross" size={12} color="var(--orange-deep)" /> {t("ad_err_date")}</div>}
            </div>

            <div className="bt-field">
              <div className="bt-flabel">{t("ad_seltime")}</div>
              <div className="bt-timeslots">
                {times.map(([hm, ap]) => (
                  <button key={hm} type="button" className={`bt-slot ${time === hm ? "on" : ""}`} onClick={() => { setTime(hm); setErr((p) => ({ ...p, time: false })); }}>{hm}<span>{t(ap)}</span></button>
                ))}
              </div>
              {err.time && <div className="bt-errmsg"><Icon name="cross" size={12} color="var(--orange-deep)" /> {t("ad_err_time")}</div>}
            </div>

            <div className="bt-field">
              <div className="bt-flabel">{t("ad_guests")}</div>
              <Stepper value={qty} set={setQty} min={1} max={20} />
            </div>

            <button type="button" onClick={() => setDriver(!driver)} className={`bt-toggle ${driver ? "on" : ""}`}>
              <span className="bt-toggle-sw"></span>
              <span style={{ flex: 1, textAlign: "start" }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}><Icon name="car" size={16} color="var(--forest)" /> {t("ad_adddriver")}</span>
                <span className="muted" style={{ display: "block", fontSize: 12 }}>{t("ad_adddriver_b")}</span>
              </span>
            </button>

            {/* live order summary */}
            <div className="bt-summary">
              <div className="bt-summary-t">{t("ad_summary")}</div>
              <SummaryRow label={t("c_date")} value={date || "—"} />
              <SummaryRow label={t("ad_seltime")} value={time || "—"} />
              <SummaryRow label={t("c_guests")} value={qty} />
              <SummaryRow label={`${t("ad_base")} ($${a.price} × ${qty})`} value={`$${base}`} />
              {driver && <SummaryRow label={`${t("ad_driverline")} · ${t("dp_veh_" + veh)}`} value={`$${driverRate}`} />}
              <div className="bt-summary-total"><span>{t("c_total")}</span><span>${total}</span></div>
            </div>

            <button className="btn btn-orange btn-block" style={{ marginTop: 14 }} onClick={onAddTrip}><Icon name="plus" size={17} color="#fff" /> {t("c_addtrip")}</button>
            <button className="btn btn-forest btn-block" style={{ marginTop: 10 }} onClick={onBook}>{t("c_book")}</button>
          </aside>
        </div>

        {/* contextual engine */}
        <div className="wrap">
          <SuggestBundles actId={a.id} />
          <LinkedItineraries actId={a.id} />
          <RelatedActivities excludeId={a.id} />
          <ReviewsBlock tags={[a.id, ...a.cats]} />
        </div>
      </div>
      {upsell && <DriverUpsell onAdd={() => { setUpsell(false); commit(true); navigate("cart"); }} onSkip={() => { setUpsell(false); commit(false); navigate("cart"); }} />}
    </React.Fragment>
  );
};

const SummaryRow = ({ label, value }) => (
  <div className="bt-summary-row"><span className="muted">{label}</span><span style={{ fontWeight: 700 }}>{value}</span></div>
);

Object.assign(window, { ActivitiesPage, ActivityDetailPage, Slider, Accordion });
