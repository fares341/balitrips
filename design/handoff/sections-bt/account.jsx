/* ============================================================
   My Account — full-screen panel with sidebar sections:
   Personal info · Favorites · My Trip · Schedules · Subscriptions · Invoices
   ============================================================ */

const ACCT_FAVS = [
  { name: { en: "Crate Café", ar: "كرايت كافيه", id: "Crate Café" }, cat: { en: "Café · Canggu", ar: "كافيه · تشانغو", id: "Kafe · Canggu" }, flickr: "canggu,beach", rating: 4.7 },
  { name: { en: "Single Fin", ar: "سينجل فين", id: "Single Fin" }, cat: { en: "Beach club · Uluwatu", ar: "بيتش كلوب · أولواتو", id: "Beach club · Uluwatu" }, flickr: "uluwatu,temple", rating: 4.8 },
  { name: { en: "Tegallalang", ar: "تيغالالانغ", id: "Tegallalang" }, cat: { en: "Scenic · Ubud", ar: "إطلالة · أوبود", id: "Pemandangan · Ubud" }, flickr: "tegallalang,rice", rating: 4.9 },
  { name: { en: "Mount Batur", ar: "جبل باتور", id: "Gunung Batur" }, cat: { en: "Hiking · North-East", ar: "مشي · الشمال الشرقي", id: "Pendakian" }, flickr: "mount-batur,volcano", rating: 4.8 },
];

const ACCT_TRIP = [
  { day: 1, items: [{ en: "Crate Café — breakfast", ar: "كرايت كافيه — فطور", id: "Crate Café — sarapan" }, { en: "Canggu beach walk", ar: "تمشية شاطئ تشانغو", id: "Jalan pantai Canggu" }] },
  { day: 2, items: [{ en: "Tegallalang sunrise", ar: "شروق تيغالالانغ", id: "Matahari terbit Tegallalang" }, { en: "Ubud art market", ar: "سوق أوبود للفنون", id: "Pasar seni Ubud" }] },
  { day: 3, items: [{ en: "Uluwatu Temple sunset", ar: "غروب معبد أولواتو", id: "Matahari terbenam Uluwatu" }] },
];

const ACCT_SCHED = [
  { name: { en: "The Complete Loop", ar: "الجولة الكاملة", id: "Putaran Lengkap" }, days: 7, flickr: "lempuyang,temple", price: "$59" },
  { name: { en: "Essential South", ar: "جنوب بالي الأساسي", id: "Bali Selatan Esensial" }, days: 3, flickr: "seminyak,beach", price: "$29" },
];

const ACCT_INV = [
  { num: "BT-2026-0184", date: "08 Jun 2026", item: { en: "VIP · Complete Loop + Map", ar: "VIP · الجولة الكاملة + الخريطة", id: "VIP · Putaran Lengkap + Peta" }, amt: "$89.00" },
  { num: "BT-2026-0151", date: "02 Jun 2026", item: { en: "Essential South (PDF)", ar: "جنوب بالي (PDF)", id: "Bali Selatan (PDF)" }, amt: "$29.00" },
  { num: "BT-2026-0142", date: "29 May 2026", item: { en: "Interactive Map · 14 days", ar: "الخريطة التفاعلية · 14 يوم", id: "Peta Interaktif · 14 hari" }, amt: "$19.00" },
];

const AccountPanel = ({ t, lang, user, tab, setTab, onClose, onSignOut, setUser, tripItems = [] }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []);

  const nav = [
    { key: "profile", icon: "user",  label: "acct_nav_profile" },
    { key: "fav",     icon: "heart", label: "acct_nav_fav" },
    { key: "trip",    icon: "route", label: "acct_nav_trip" },
    { key: "sched",   icon: "cal",   label: "acct_nav_sched" },
    { key: "subs",    icon: "star",  label: "acct_nav_subs" },
    { key: "inv",     icon: "pdf",   label: "acct_nav_inv" },
  ];
  const initials = (user.name || "T").trim().charAt(0).toUpperCase();

  return (
    <div className="bt-acct-scrim">
      <div className="bt-acct">
        {/* top bar */}
        <div className="bt-acct-top">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Logo height={26} />
            <span style={{ width: 1, height: 22, background: "var(--line)" }}></span>
            <span style={{ fontWeight: 800, fontSize: 18 }}>{t("acct_title")}</span>
          </div>
          <button className="bt-acct-close" onClick={onClose}><Icon name="cross" size={18} /> <span className="bt-hide-sm">{t("acct_close")}</span></button>
        </div>

        <div className="bt-acct-grid">
          {/* sidebar */}
          <aside className="bt-acct-side">
            <div className="bt-acct-user">
              <span className="bt-avatar bt-avatar-lg">{initials}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15.5 }}>{user.name}</div>
                <div className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
              </div>
            </div>
            <nav className="bt-acct-nav">
              {nav.map((n) => (
                <button key={n.key} className={tab === n.key ? "on" : ""} onClick={() => setTab(n.key)}>
                  <Icon name={n.icon} size={18} color={tab === n.key ? "var(--orange-deep)" : "var(--forest-soft)"} />
                  <span>{t(n.label)}</span>
                </button>
              ))}
            </nav>
            <button className="bt-acct-signout" onClick={onSignOut}>
              <Icon name="arrow" size={17} color="var(--orange-deep)" className="flip" /> {t("acct_signout")}
            </button>
          </aside>

          {/* content */}
          <main className="bt-acct-main">
            {tab === "profile" && <AcctProfile t={t} lang={lang} user={user} />}
            {tab === "fav" && <AcctFavorites t={t} lang={lang} setTab={setTab} />}
            {tab === "trip" && <AcctTrip t={t} lang={lang} tripItems={tripItems} />}
            {tab === "sched" && <AcctSchedules t={t} lang={lang} />}
            {tab === "subs" && <AcctSubs t={t} lang={lang} />}
            {tab === "inv" && <AcctInvoices t={t} lang={lang} />}
          </main>
        </div>
      </div>
    </div>
  );
};

const SectionTitle = ({ children, count }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 20 }}>
    <h3 style={{ fontSize: 24 }}>{children}</h3>
    {count != null && <span className="muted" style={{ fontSize: 14 }}>· {count}</span>}
  </div>
);

const AcctProfile = ({ t, lang, user }) => (
  <div>
    <SectionTitle>{t("acct_profile_t")}</SectionTitle>
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
      <span className="bt-avatar" style={{ width: 72, height: 72, fontSize: 28 }}>{(user.name || "T").charAt(0).toUpperCase()}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 20 }}>{user.name}</div>
        <div className="muted" style={{ fontSize: 13.5 }}>{t("acct_member")} {user.since || "Jun 2026"}</div>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, maxWidth: 640 }}>
      <ProfileField label={t("auth_name")} value={user.name} />
      <ProfileField label={t("auth_email")} value={user.email} />
      <ProfileField label={t("auth_phone")} value={user.phone || "+62 ···"} />
      <ProfileField label={t("auth_country")} value={user.country || "—"} />
    </div>
    <button className="btn btn-orange" style={{ marginTop: 24 }}>{t("acct_save")}</button>
  </div>
);

const ProfileField = ({ label, value }) => (
  <label style={{ display: "block" }}>
    <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</span>
    <input defaultValue={value} style={{ width: "100%", border: "1.5px solid var(--line)", borderRadius: 12, padding: "12px 14px", fontSize: 15, fontFamily: "inherit", color: "var(--forest)", background: "var(--ivory)", minHeight: 46 }} />
  </label>
);

const AcctFavorites = ({ t, lang, setTab }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
      <SectionTitle count={ACCT_FAVS.length}>{t("acct_fav_t")}</SectionTitle>
      <button className="btn btn-forest" style={{ minHeight: 44 }} onClick={() => setTab("trip")}>
        <Icon name="route" size={16} color="var(--ivory)" /> {t("acct_fav_create")}
      </button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
      {ACCT_FAVS.map((f, i) => (
        <div key={i} className="card" style={{ overflow: "hidden" }}>
          <div style={{ height: 130, position: "relative" }}>
            <Photo src={flickr(f.flickr, 400, 300, 40 + i)} alt={f.name[lang]} style={{ height: "100%" }} />
            <span style={{ position: "absolute", top: 10, insetInlineEnd: 10, background: "rgba(27,63,34,0.85)", color: "#fff", borderRadius: 999, padding: "4px 9px", fontSize: 12, fontWeight: 700 }}>★ {f.rating}</span>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{f.name[lang]}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{f.cat[lang]}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-orange" style={{ flex: 1, minHeight: 40, fontSize: 13, padding: "8px 10px" }}>{t("acct_fav_addtrip")}</button>
              <button className="btn btn-ghost" style={{ minHeight: 40, fontSize: 13, padding: "8px 12px" }}>{t("acct_fav_remove")}</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const AcctTrip = ({ t, lang, tripItems = [] }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
      <SectionTitle>{t("acct_trip_t")}</SectionTitle>
      <button className="btn btn-ghost" style={{ minHeight: 44 }}><Icon name="pdf" size={16} /> {t("acct_trip_export")}</button>
    </div>
    <p className="muted" style={{ marginTop: 0, marginBottom: 20, fontSize: 14.5 }}>{t("acct_trip_sub")}</p>

    {tripItems.length > 0 && (
      <div className="card" style={{ padding: 18, marginBottom: 14, border: "1.5px solid var(--palm)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Icon name="check" size={18} color="var(--forest)" />
          <span style={{ fontWeight: 800, fontSize: 15 }}>{t("cart_toTrip")}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tripItems.map((it, j) => (
            <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--ivory-2)", borderRadius: 10, fontSize: 14.5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--orange)" }}></span>
              <span style={{ flex: 1 }}>{it.name[lang]}{it.meta ? " · " + it.meta[lang] : ""}</span>
              <span style={{ fontWeight: 700, color: "var(--orange-deep)" }}>${it.price * (it.qty || 1)}</span>
            </div>
          ))}
        </div>
      </div>
    )}

    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {ACCT_TRIP.map((d) => (
        <div key={d.day} className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: "var(--orange)", color: "#fff", fontWeight: 800, display: "grid", placeItems: "center", fontSize: 14 }}>{d.day}</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{t("acct_trip_day")} {d.day}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {d.items.map((it, j) => (
              <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--ivory-2)", borderRadius: 10, fontSize: 14.5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--forest-soft)" }}></span>
                {it[lang]}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const AcctSchedules = ({ t, lang }) => (
  <div>
    <SectionTitle count={ACCT_SCHED.length}>{t("acct_sched_t")}</SectionTitle>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
      {ACCT_SCHED.map((s, i) => (
        <div key={i} className="card" style={{ overflow: "hidden" }}>
          <div style={{ height: 140, position: "relative" }}>
            <Photo src={flickr(s.flickr, 500, 320, 50 + i)} alt={s.name[lang]} style={{ height: "100%" }} />
            <span style={{ position: "absolute", top: 10, insetInlineStart: 10, background: "rgba(27,63,34,0.85)", color: "#fff", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>{s.days} {t("acct_sched_days")}</span>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{s.name[lang]}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-orange" style={{ flex: 1, minHeight: 42, fontSize: 13.5 }}><Icon name="pdf" size={15} color="#fff" /> {t("acct_sched_dl")}</button>
              <button className="btn btn-ghost" style={{ minHeight: 42, fontSize: 13.5 }}>{t("acct_sched_view")}</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const AcctSubs = ({ t, lang }) => { const { navigate } = useBT(); return (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <SectionTitle>{t("acct_subs_t")}</SectionTitle>
      <button className="btn btn-forest" style={{ minHeight: 44 }} onClick={() => navigate("plans")}><Icon name="star" size={15} color="var(--ivory)" /> {t("acct_subs_browse")}</button>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 620 }}>
      <div className="card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,144,0,0.14)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="pin" size={24} color="var(--orange-deep)" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{t("acct_subs_map")}</div>
          <div className="muted" style={{ fontSize: 13 }}>{t("acct_subs_until")} 22 Jul 2026</div>
        </div>
        <span className="tag tag-palm">{t("acct_subs_active")}</span>
      </div>
      <div className="card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16, opacity: 0.7 }}>
        <span style={{ width: 48, height: 48, borderRadius: 14, background: "var(--ivory-2)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="gem" size={22} color="var(--muted)" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Hidden Gems & VIP places</div>
          <div className="muted" style={{ fontSize: 13 }}>{t("acct_subs_expired")} · 02 Jun 2026</div>
        </div>
        <button className="btn btn-orange" style={{ minHeight: 40, fontSize: 13.5 }} onClick={() => navigate("plans")}>{t("acct_subs_renew")}</button>
      </div>
    </div>
  </div>
); };

const AcctInvoices = ({ t, lang }) => (
  <div>
    <SectionTitle count={ACCT_INV.length}>{t("acct_inv_t")}</SectionTitle>
    <div className="card" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["acct_inv_num", "acct_inv_date", "acct_inv_item", "acct_inv_amt", "acct_inv_status"].map((k, i) => (
              <th key={k} style={{ textAlign: i === 3 ? "end" : "start", padding: "14px 16px", fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--line)" }}>{t(k)}</th>
            ))}
            <th style={{ borderBottom: "1px solid var(--line)" }}></th>
          </tr>
        </thead>
        <tbody>
          {ACCT_INV.map((r) => (
            <tr key={r.num}>
              <td style={{ padding: "14px 16px", fontWeight: 700, fontSize: 13.5, borderBottom: "1px solid var(--line-soft)" }}>{r.num}</td>
              <td style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--muted)", borderBottom: "1px solid var(--line-soft)", whiteSpace: "nowrap" }}>{r.date}</td>
              <td style={{ padding: "14px 16px", fontSize: 13.5, borderBottom: "1px solid var(--line-soft)" }}>{r.item[lang]}</td>
              <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, textAlign: "end", borderBottom: "1px solid var(--line-soft)", whiteSpace: "nowrap" }}>{r.amt}</td>
              <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}><span className="tag tag-palm" style={{ whiteSpace: "nowrap" }}>{t("acct_inv_paid")}</span></td>
              <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)", textAlign: "end" }}>
                <button className="btn btn-ghost" style={{ minHeight: 36, fontSize: 12.5, padding: "6px 12px" }}><Icon name="pdf" size={14} /> {t("acct_inv_dl")}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

Object.assign(window, { AccountPanel });
