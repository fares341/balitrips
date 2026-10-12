/* ============================================================
   DRIVER — isolated booking engine. Date range + passengers →
   auto-assigned vehicle class + instantly computed price.
   ============================================================ */

const daysBetween = (s, e) => {
  if (!s) return 1;
  if (!e) return 1;
  const d = Math.round((new Date(e) - new Date(s)) / 86400000) + 1;
  return d > 0 ? d : 1;
};

const DriverPage = () => {
  const { t, lang, navigate, addToTrip, toast } = useBT();
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [pax, setPax] = React.useState(2);

  const days = daysBetween(start, end);
  const veh = vehicleFor(pax);
  const rate = veh === "van" ? 95 : veh === "suv" ? 70 : 45;
  const total = days * rate;
  const vehKey = { sedan: "dp_veh_sedan", suv: "dp_veh_suv", van: "dp_veh_van" }[veh];
  const vehIcon = { sedan: "car", suv: "suv", van: "van" }[veh];

  const vps = [["car","dp_vp1"],["sun","dp_vp2"],["users","dp_vp3"],["compass","dp_vp4"],["pin","dp_vp5"],["route","dp_vp6"]];
  const steps = ["dp_how1","dp_how2","dp_how3","dp_how4","dp_how5"];

  const commit = () => { addToTrip(mkDriver({ days, pax, veh, date: start })); toast(t("c_added")); };
  const onBook = () => { commit(); navigate("cart"); };

  return (
    <React.Fragment>
      <PageBanner image="bali,road,jungle" seed={3} tag={t("dp_title")} title={t("dp_hero_t")} subtitle={t("dp_hero_b")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_driver") }]} />

      <section className="bg-ivory">
        <div className="wrap bt-detail-grid">
          <div className="bt-detail-main">
            {/* value props */}
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("dp_vp_t")}</h2>
              <div className="bt-vpgrid">
                {vps.map(([ic, k]) => (
                  <div key={k} className="bt-vp"><span className="bt-vp-ic"><Icon name={ic} size={20} color="var(--forest)" /></span><span>{t(k)}</span></div>
                ))}
              </div>
            </div>

            {/* transparency protocol */}
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("dp_how_t")}</h2>
              <ol className="bt-steps">
                {steps.map((k, i) => (
                  <li key={k}><span className="bt-step-n">{i + 1}</span><span>{t(k)}</span></li>
                ))}
              </ol>
            </div>

            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t("ad_gallery")}</h2>
              <div className="bt-gallery-grid">{["bali,car","ubud,road","bali,jungle,road","tegallalang,rice"].map((g, i) => <Photo key={i} src={flickr(g, 400, 300, 30 + i)} alt="" radius={12} style={{ height: 120 }} />)}</div>
            </div>
          </div>

          {/* booking engine */}
          <aside className="bt-booking">
            <h3 style={{ fontSize: 18, marginBottom: 16 }}>{t("dp_book")}</h3>
            <div className="bt-field">
              <div className="bt-flabel">{t("dp_start")}</div>
              <input type="date" className="bt-input" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="bt-field">
              <div className="bt-flabel">{t("dp_end")}</div>
              <input type="date" className="bt-input" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="bt-field">
              <div className="bt-flabel">{t("dp_pax")}</div>
              <Stepper value={pax} set={setPax} min={1} max={20} />
            </div>

            {/* auto-assigned vehicle */}
            <div className="bt-vehicle">
              <span className="bt-vehicle-ic"><Icon name={vehIcon} size={28} color="var(--forest)" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{t("dp_vehicle")}</div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{t(vehKey)}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{t(vehKey + "_b")}</div>
              </div>
              <span className="tag tag-palm" style={{ fontSize: 10.5 }}>{t("dp_auto")}</span>
            </div>

            <div className="bt-summary">
              <SummaryRow label={t("dp_dates")} value={start ? `${days} ${days === 1 ? t("dp_days_one").replace(/^1 /, "") : t("c_days")}` : "—"} />
              <SummaryRow label={t("dp_pax")} value={pax} />
              <SummaryRow label={`$${rate}${t("dp_perday")} × ${days}`} value={`$${total}`} />
              <div className="bt-summary-total"><span>{t("dp_est")}</span><span>${total}</span></div>
            </div>

            <button className="btn btn-orange btn-block" style={{ marginTop: 14 }} onClick={commit}><Icon name="plus" size={17} color="#fff" /> {t("dp_addtrip")}</button>
            <button className="btn btn-forest btn-block" style={{ marginTop: 10 }} onClick={onBook}>{t("c_book")}</button>
          </aside>
        </div>
      </section>

      <section className="bg-ivory-2"><div className="wrap"><ReviewsBlock tags={["adv","family","beach","nature"]} title={t("rev_title")} /></div></section>
    </React.Fragment>
  );
};

Object.assign(window, { DriverPage });
