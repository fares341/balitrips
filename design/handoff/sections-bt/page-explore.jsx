/* ============================================================
   EXPLORE BALI (استكشف بالي)  +  CONTACT US (تواصل معنا)
   ============================================================ */

const ExplorePage = () => {
  const { t, lang, navigate } = useBT();
  const [reg, setReg] = React.useState("all");
  const list = LANDMARKS.filter((l) => reg === "all" || l.region === reg);
  const regs = [{ key: "all", label: L(t("hl_allregions"), t("hl_allregions"), t("hl_allregions")) },
    ...Object.keys(REGIONS).map((k) => ({ key: k, label: REGIONS[k] }))];
  return (
    <React.Fragment>
      <PageBanner image="bali,landscape,ocean" seed={18} tag={t("navr_explore")} title={t("ex_title")} subtitle={t("ex_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_explore") }]} />
      <section className="bg-ivory">
        <div className="wrap">
          <div className="bt-filterchips" style={{ marginBottom: 26 }}>
            {regs.map((r) => <button key={r.key} onClick={() => setReg(r.key)} className={`chip ${reg === r.key ? "active" : ""}`} style={{ minHeight: 42 }}>{r.label[lang]}</button>)}
          </div>
          <div className="grid bt-grid-3auto">{list.map((l, i) => <LandmarkCard key={l.id} l={l} seed={60 + i} />)}</div>
        </div>
      </section>
      <section className="bg-ivory-2">
        <div className="wrap">
          <Head t={t} eyebrow="map_eyebrow" title="hm_title" center />
          <div className="center"><button className="btn btn-orange" onClick={() => navigate("map")}><Icon name="pin" size={18} color="#fff" /> {t("hm_cta")}</button></div>
        </div>
      </section>
    </React.Fragment>
  );
};

const ContactPage = () => {
  const { t, lang, toast } = useBT();
  const [sent, setSent] = React.useState(false);
  const [f, setF] = React.useState({ name: "", email: "", subject: "", msg: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = (e) => { e.preventDefault(); setSent(true); toast(t("co_sent")); };
  const waLink = `https://wa.me/${WA_NUMBER}`;
  return (
    <React.Fragment>
      <PageBanner image="canggu,beach" seed={19} tag={t("navr_contact")} title={t("co_title")} subtitle={t("co_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_contact") }]} />
      <section className="bg-ivory">
        <div className="wrap bt-contact-grid">
          <div className="bt-contact-cards">
            <a href={waLink} target="_blank" rel="noopener" className="bt-contact-card">
              <span className="bt-contact-ic" style={{ background: "var(--palm-soft)" }}><Icon name="whatsapp" size={22} color="var(--forest)" /></span>
              <span><span className="bt-contact-t">{t("co_wa")}</span><span className="bt-contact-b">+966 4815 654 4666</span><span className="bt-contact-b muted">{t("co_wa_b")}</span></span>
            </a>
            <a href="mailto:hello@balitrips.com" className="bt-contact-card">
              <span className="bt-contact-ic" style={{ background: "rgba(255,144,0,.14)" }}><Icon name="mail" size={22} color="var(--orange-deep)" /></span>
              <span><span className="bt-contact-t">{t("co_mail")}</span><span className="bt-contact-b">hello@balitrips.com</span><span className="bt-contact-b muted">{t("co_mail_b")}</span></span>
            </a>
            <div className="bt-contact-card" style={{ cursor: "default" }}>
              <span className="bt-contact-ic" style={{ background: "var(--palm-soft)" }}><Icon name="pin" size={22} color="var(--forest)" /></span>
              <span><span className="bt-contact-t">{t("co_office")}</span><span className="bt-contact-b">Seminyak, Bali · Indonesia</span><span className="bt-contact-b">Jeddah · Saudi Arabia</span></span>
            </div>
            <div className="bt-contact-card" style={{ cursor: "default" }}>
              <span className="bt-contact-ic" style={{ background: "rgba(255,144,0,.14)" }}><Icon name="clock" size={22} color="var(--orange-deep)" /></span>
              <span><span className="bt-contact-t">{t("co_hours")}</span><span className="bt-contact-b">{t("co_hours_b")}</span></span>
            </div>
          </div>

          <div className="card card-pad">
            <h3 style={{ fontSize: 21, marginBottom: 18 }}>{t("co_form_t")}</h3>
            {sent ? (
              <div className="center" style={{ padding: "30px 10px" }}>
                <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--forest)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}><Icon name="check" size={30} color="#fff" /></span>
                <p style={{ fontSize: 16, fontWeight: 600 }}>{t("co_sent")}</p>
              </div>
            ) : (
              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label className="bt-field" style={{ marginBottom: 0 }}><span className="bt-flabel">{t("co_name")}</span><input className="bt-input" required value={f.name} onChange={set("name")} /></label>
                <label className="bt-field" style={{ marginBottom: 0 }}><span className="bt-flabel">{t("co_email")}</span><input type="email" className="bt-input" required value={f.email} onChange={set("email")} /></label>
                <label className="bt-field" style={{ marginBottom: 0 }}><span className="bt-flabel">{t("co_subject")}</span><input className="bt-input" value={f.subject} onChange={set("subject")} /></label>
                <label className="bt-field" style={{ marginBottom: 0 }}><span className="bt-flabel">{t("co_msg")}</span><textarea className="bt-input" style={{ minHeight: 130, resize: "vertical" }} required placeholder={t("co_msg_ph")} value={f.msg} onChange={set("msg")} /></label>
                <button type="submit" className="btn btn-orange btn-block">{t("co_send")} <Icon name="arrow" size={17} color="#fff" className="flip" /></button>
              </form>
            )}
          </div>
        </div>
      </section>
    </React.Fragment>
  );
};

Object.assign(window, { ExplorePage, ContactPage });
