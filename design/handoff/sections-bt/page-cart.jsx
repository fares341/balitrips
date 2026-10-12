/* ============================================================
   MY TRIP (رحلتي) — unified cart. Groups every added item by
   type; dates / times / guests / prices; grand total; checkout.
   ============================================================ */

const CartPage = () => {
  const { t, lang, navigate, cart, removeFromTrip, setQty, cartTotal, user, openAuth, clearCart, toast } = useBT();
  const [done, setDone] = React.useState(false);

  const groups = ["activity", "driver", "itinerary", "package", "place"];
  const byKind = groups.map((g) => ({ kind: g, items: cart.filter((i) => i.kind === g) })).filter((g) => g.items.length);

  const complete = () => {
    if (!user) { openAuth("signup"); return; }
    setDone(true); clearCart(); window.scrollTo(0, 0);
  };

  if (done) return (
    <div className="bt-detailwrap">
      <div className="wrap"><div className="bt-cart-done">
        <span className="bt-cart-done-ic"><Icon name="check" size={40} color="#fff" /></span>
        <h1 style={{ fontSize: "clamp(26px,4.5vw,40px)", marginTop: 18 }}>{t("cart_toTrip")}</h1>
        <p className="lede" style={{ marginTop: 12, maxWidth: "48ch", marginInline: "auto" }}>{t("acct_trip_sub")}</p>
        <div className="row" style={{ gap: 10, justifyContent: "center", marginTop: 22 }}>
          <button className="btn btn-forest" onClick={() => navigate("home")}>{t("c_home")}</button>
          <button className="btn btn-orange" onClick={() => navigate("activities")}>{t("ct2_browse")}</button>
        </div>
      </div></div>
    </div>
  );

  return (
    <div className="bt-detailwrap">
      <div className="wrap"><Breadcrumbs trail={[{ label: t("c_home"), to: "home" }, { label: t("ct2_title") }]} /></div>
      <div className="wrap">
        <div className="bt-sec-head" style={{ marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: "clamp(28px,5vw,42px)" }}>{t("ct2_title")}</h1>
            <p className="lede" style={{ marginTop: 10 }}>{t("ct2_sub")}</p>
          </div>
        </div>

        {cart.length === 0 ? (
          <div className="bt-cart-empty2">
            <span style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--ivory-2)", display: "grid", placeItems: "center" }}><Icon name="cart" size={32} color="var(--muted)" /></span>
            <h3 style={{ fontSize: 20 }}>{t("ct2_empty")}</h3>
            <p className="muted" style={{ fontSize: 14.5, maxWidth: "42ch" }}>{t("ct2_empty_b")}</p>
            <button className="btn btn-orange" onClick={() => navigate("activities")}>{t("ct2_browse")}</button>
          </div>
        ) : (
          <div className="bt-cart-grid">
            <div className="bt-cart-lines">
              {byKind.map((g) => (
                <div key={g.kind} className="bt-cart-group">
                  <div className="bt-cart-grouphead">
                    <Icon name={{ activity: "compass", driver: "car", itinerary: "cal", package: "star", place: "pin" }[g.kind]} size={17} color="var(--forest)" />
                    {t("ct2_grp_" + g.kind)} <span className="muted">· {g.items.length}</span>
                  </div>
                  {g.items.map((it) => (
                    <div key={it.id} className="bt-cart-line">
                      <Photo src={flickr(it.flickr || "bali,beach", 200, 200, 5)} alt="" radius={12} style={{ width: 72, height: 72, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{it.name[lang]}</div>
                        {it.meta && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{it.meta[lang]}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                          {it.kind === "activity" ? (
                            <div className="bt-stepper bt-stepper-sm">
                              <button type="button" onClick={() => setQty(it.id, Math.max(1, (it.qty || 1) - 1))}><Icon name="minus" size={13} /></button>
                              <span>{it.qty}</span>
                              <button type="button" onClick={() => setQty(it.id, (it.qty || 1) + 1)}><Icon name="plus" size={13} /></button>
                            </div>
                          ) : <span />}
                          <button className="bt-cart-remove" onClick={() => removeFromTrip(it.id)}><Icon name="trash" size={14} /> {t("ct2_remove")}</button>
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "var(--orange-deep)", whiteSpace: "nowrap" }}>
                        {it.kind === "place" ? "—" : `$${it.price * (it.qty || 1)}`}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <aside className="bt-booking" style={{ position: "sticky", top: 96 }}>
              <h3 style={{ fontSize: 18, marginBottom: 14 }}>{t("ad_summary")}</h3>
              <div className="bt-summary" style={{ marginTop: 0 }}>
                {byKind.map((g) => {
                  const sub = g.items.reduce((s, it) => s + (it.price * (it.qty || 1)), 0);
                  return <SummaryRow key={g.kind} label={`${t("ct2_grp_" + g.kind)} (${g.items.length})`} value={sub ? `$${sub}` : "—"} />;
                })}
                <div className="bt-summary-total"><span>{t("c_total")}</span><span>${cartTotal}</span></div>
              </div>
              <button className="btn btn-orange btn-block" style={{ marginTop: 14 }} onClick={complete}>{t("ct2_complete")} <Icon name="arrow" size={17} color="#fff" className="flip" /></button>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => navigate("activities")}>{t("ct2_browse")}</button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { CartPage });
