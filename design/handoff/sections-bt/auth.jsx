/* ============================================================
   Auth — sign in / sign up / forgot password (mock, localStorage)
   ============================================================ */

const BT_USER_KEY = "bt_user";

function loadUser() {
  try { return JSON.parse(localStorage.getItem(BT_USER_KEY) || "null"); } catch (e) { return null; }
}
function saveUser(u) {
  if (u) localStorage.setItem(BT_USER_KEY, JSON.stringify(u));
  else localStorage.removeItem(BT_USER_KEY);
}

const Field = ({ label, type = "text", value, onChange, placeholder, autoComplete }) => (
  <label style={{ display: "block" }}>
    <span className="label" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--forest)", marginBottom: 6 }}>{label}</span>
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete}
      style={{
        width: "100%", border: "1.5px solid var(--line)", borderRadius: 12,
        padding: "13px 14px", fontSize: 15, fontFamily: "inherit", color: "var(--forest)",
        background: "var(--ivory)", minHeight: 48, outline: "none",
      }}
      onFocus={(e) => { e.target.style.borderColor = "var(--orange)"; e.target.style.background = "#fff"; }}
      onBlur={(e) => { e.target.style.borderColor = "var(--line)"; e.target.style.background = "var(--ivory)"; }}
    />
  </label>
);

const SocialBtns = ({ t }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <button type="button" className="btn btn-ghost btn-block" style={{ gap: 10 }}>
      <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.9 2.5 2.8 6.6 2.8 11.7S6.9 21 12 21c5.3 0 8.8-3.7 8.8-9 0-.6-.06-1-.15-1.5z"/></svg>
      {t("auth_google")}
    </button>
    <button type="button" className="btn btn-ghost btn-block" style={{ gap: 10 }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="var(--forest)"><path d="M16.4 12.6c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8s-1.7-.8-2.9-.8c-1.5 0-2.9.9-3.6 2.2-1.6 2.7-.4 6.7 1.1 8.9.7 1.1 1.6 2.3 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.6.7 2.8.7c1.2 0 1.9-1.1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4s-2.1-.8-2.1-3.2zM14.3 6.3c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 2-.5 2.5-1.2z"/></svg>
      {t("auth_apple")}
    </button>
  </div>
);

const AuthModal = ({ t, lang, mode, setMode, onClose, onAuthed }) => {
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", country: "", password: "", password2: "" });
  const [sent, setSent] = React.useState(false);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submitIn = (e) => {
    e.preventDefault();
    onAuthed({ name: form.name || "Traveler", email: form.email || "you@email.com", country: form.country || "—", since: "Jun 2026" });
  };
  const submitUp = (e) => {
    e.preventDefault();
    onAuthed({ name: form.name || "Traveler", email: form.email || "you@email.com", phone: form.phone, country: form.country || "—", since: "Jun 2026" });
  };

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="bt-modal-scrim" onClick={onClose}>
      <div className="bt-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* left visual (desktop) */}
        <div className="bt-modal-aside">
          <Photo src={flickr("uluwatu,temple", 700, 1000, 1)} alt="Bali" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          <div className="bt-modal-aside-veil"></div>
          <div className="bt-modal-aside-inner">
            <div style={{ background: "rgba(255,251,248,0.92)", display: "inline-block", padding: "8px 12px", borderRadius: 12 }}>
              <Logo height={26} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: "#fff" }}>{t("foot_tagline")}</div>
              <div style={{ fontSize: 14, color: "rgba(255,251,248,0.85)", marginTop: 8 }}>{t("hero_kicker")}</div>
            </div>
          </div>
        </div>

        {/* form side */}
        <div className="bt-modal-body">
          <button className="bt-modal-x" onClick={onClose} aria-label={t("acct_close")}><Icon name="cross" size={20} /></button>

          {mode !== "forgot" && (
            <div className="bt-auth-tabs">
              <button className={mode === "signin" ? "on" : ""} onClick={() => setMode("signin")}>{t("auth_tab_in")}</button>
              <button className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>{t("auth_tab_up")}</button>
            </div>
          )}

          {mode === "signin" && (
            <form onSubmit={submitIn} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 26 }}>{t("auth_signin_t")}</h3>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 14.5 }}>{t("auth_signin_sub")}</p>
              </div>
              <Field label={t("auth_email")} type="email" value={form.email} onChange={upd("email")} placeholder="you@email.com" autoComplete="email" />
              <Field label={t("auth_password")} type="password" value={form.password} onChange={upd("password")} placeholder="••••••••" autoComplete="current-password" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" defaultChecked style={{ width: 16, height: 16, accentColor: "var(--orange)" }} />
                  {t("auth_remember")}
                </label>
                <button type="button" onClick={() => setMode("forgot")} style={{ background: "none", border: 0, color: "var(--orange-deep)", fontWeight: 600, cursor: "pointer", fontSize: 13.5 }}>{t("auth_forgot_link")}</button>
              </div>
              <button type="submit" className="btn btn-orange btn-block">{t("auth_in_btn")}</button>
              <Divider t={t} />
              <SocialBtns t={t} />
              <p className="center muted" style={{ fontSize: 13.5, margin: 0 }}>
                {t("auth_no_acct")} <button type="button" onClick={() => setMode("signup")} style={{ background: "none", border: 0, color: "var(--orange-deep)", fontWeight: 700, cursor: "pointer" }}>{t("auth_tab_up")}</button>
              </p>
            </form>
          )}

          {mode === "signup" && (
            <form onSubmit={submitUp} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <h3 style={{ fontSize: 26 }}>{t("auth_signup_t")}</h3>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 14.5 }}>{t("auth_signup_sub")}</p>
              </div>
              <Field label={t("auth_name")} value={form.name} onChange={upd("name")} placeholder="Maya Ardiansyah" autoComplete="name" />
              <Field label={t("auth_email")} type="email" value={form.email} onChange={upd("email")} placeholder="you@email.com" autoComplete="email" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label={t("auth_phone")} value={form.phone} onChange={upd("phone")} placeholder="+62 ···" />
                <Field label={t("auth_country")} value={form.country} onChange={upd("country")} placeholder="UAE" />
              </div>
              <Field label={t("auth_password")} type="password" value={form.password} onChange={upd("password")} placeholder="••••••••" autoComplete="new-password" />
              <button type="submit" className="btn btn-orange btn-block">{t("auth_up_btn")}</button>
              <p className="center muted" style={{ fontSize: 12, margin: 0 }}>{t("auth_terms")}</p>
              <Divider t={t} />
              <SocialBtns t={t} />
              <p className="center muted" style={{ fontSize: 13.5, margin: 0 }}>
                {t("auth_has_acct")} <button type="button" onClick={() => setMode("signin")} style={{ background: "none", border: 0, color: "var(--orange-deep)", fontWeight: 700, cursor: "pointer" }}>{t("auth_tab_in")}</button>
              </p>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 26 }}>{t("auth_forgot_t")}</h3>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 14.5 }}>{t("auth_forgot_sub")}</p>
              </div>
              {sent ? (
                <div style={{ background: "var(--palm-soft)", color: "var(--forest)", borderRadius: 12, padding: "14px 16px", fontSize: 14.5, fontWeight: 600, display: "flex", gap: 10, alignItems: "center" }}>
                  <Icon name="check" size={18} color="var(--forest)" /> {t("auth_sent")}
                </div>
              ) : (
                <Field label={t("auth_email")} type="email" value={form.email} onChange={upd("email")} placeholder="you@email.com" autoComplete="email" />
              )}
              {!sent && <button type="submit" className="btn btn-orange btn-block">{t("auth_send_btn")}</button>}
              <button type="button" onClick={() => { setMode("signin"); setSent(false); }} style={{ background: "none", border: 0, color: "var(--orange-deep)", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>← {t("auth_back")}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const Divider = ({ t }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted)", fontSize: 12.5 }}>
    <span style={{ flex: 1, height: 1, background: "var(--line)" }}></span>
    {t("auth_or")}
    <span style={{ flex: 1, height: 1, background: "var(--line)" }}></span>
  </div>
);

Object.assign(window, { AuthModal, loadUser, saveUser });
