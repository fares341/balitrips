/* ============================================================
   HEADER — centered logo, route-mapped nav, search · account ·
   language · cart · Start Planning. Mobile drawer.
   ============================================================ */

const LangSwitcher = ({ dark }) => {
  const { lang, setLang } = useBT();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("click", close); return () => document.removeEventListener("click", close);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} className="chip" aria-label="Language" style={{ gap: 7, padding: "9px 13px", minHeight: 42 }}>
        <Icon name="globe" size={17} /><span style={{ fontWeight: 700 }}>{LANGS[lang].short}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", insetInlineEnd: 0, zIndex: 60, background: "var(--white)", borderRadius: 14, boxShadow: "var(--shadow-md)", border: "1px solid var(--line)", overflow: "hidden", minWidth: 150 }}>
          {Object.keys(LANGS).map((k) => (
            <button key={k} onClick={() => { setLang(k); setOpen(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", padding: "12px 16px", border: 0, background: lang === k ? "var(--ivory-2)" : "transparent", color: "var(--forest)", fontWeight: 600, fontSize: 14, textAlign: "start", cursor: "pointer" }}>
              <span style={{ fontFamily: k === "ar" ? "var(--arabic)" : "var(--sans)" }}>{LANGS[k].label}</span>
              {lang === k && <Icon name="check" size={16} color="var(--orange)" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const IconBtn = ({ name, onClick, label, badge, active }) => (
  <button onClick={onClick} aria-label={label} title={label} className={active ? "bt-iconbtn on" : "bt-iconbtn"}>
    <Icon name={name} size={19} />
    {badge > 0 && <span className="bt-iconbtn-badge">{badge}</span>}
  </button>
);

const Header = () => {
  const { t, lang, route, navigate, user, openAuth, cartCount, openSearch, openAccount, signOut } = useBT();
  const [scrolled, setScrolled] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const [acctMenu, setAcctMenu] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll); return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    ["home", "navr_home"], ["services", "navr_services"], ["driver", "navr_driver2"],
    ["activities", "navr_act"], ["itineraries", "navr_itin"], ["map", "navr_map"],
    ["explore", "navr_explore"], ["plans", "acct_nav_subs"], ["blog", "navr_blog"], ["contact", "navr_contact"],
  ];
  const go = (r) => { setMenu(false); navigate(r); };
  const onAcct = () => { if (!user) openAuth("signin"); else setAcctMenu((v) => !v); };

  const acctBtn = (
    <div style={{ position: "relative" }}>
      <button className={`bt-iconbtn ${user ? "on" : ""}`} onClick={onAcct} aria-label={t("nav_account")} title={user ? user.name : t("acct_signin_cta")}>
        {user ? <span style={{ fontWeight: 800, fontSize: 15 }}>{(user.name || "T").trim().charAt(0).toUpperCase()}</span> : <Icon name="user" size={20} />}
      </button>
      {acctMenu && user && <AccountMenu t={t} lang={lang} user={user} onOpenAccount={(tab) => { setAcctMenu(false); openAccount(tab); }} onSignOut={() => { setAcctMenu(false); signOut(); }} onClose={() => setAcctMenu(false)} />}
    </div>
  );

  return (
    <header className="bt-header" style={{ background: scrolled ? "rgba(255,251,248,0.94)" : "rgba(255,251,248,0.8)", borderBottom: scrolled ? "1px solid var(--line-soft)" : "1px solid transparent" }}>
      <div className="wrap bt-head-bar">
        <div className="bt-head-side bt-head-start">
          <button className="bt-burger" onClick={() => setMenu(!menu)} aria-label="Menu"><Icon name={menu ? "cross" : "menu"} size={22} /></button>
          <div className="bt-head-side-desktop">{acctBtn}<LangSwitcher /></div>
        </div>
        <button className="bt-head-logo" onClick={() => go("home")} aria-label="Home"><Logo height={32} /></button>
        <div className="bt-head-side bt-head-end">
          <IconBtn name="search" onClick={openSearch} label={t("c_search")} />
          <IconBtn name="cart" onClick={() => navigate("cart")} label={t("ct2_title")} badge={cartCount} active={route.name === "cart"} />
          <button type="button" onClick={() => navigate("services")} className="btn btn-orange bt-cta-desktop" style={{ padding: "12px 20px", minHeight: 44 }}>{t("c_startplan")}</button>
          <div className="bt-head-acct-mobile">{acctBtn}</div>
        </div>
      </div>

      <nav className="bt-nav-desktop">
        {links.map(([r, k]) => (
          <button key={r} type="button" onClick={() => go(r)} className={`bt-nav-btn ${route.name === r ? "on" : ""}`}>{t(k)}</button>
        ))}
      </nav>

      {menu && (
        <div className="bt-drawer">
          <nav style={{ display: "flex", flexDirection: "column" }}>
            {links.map(([r, k]) => (
              <button key={r} type="button" onClick={() => go(r)} className="bt-drawer-link" style={{ color: route.name === r ? "var(--orange-deep)" : "var(--forest)" }}>{t(k)}</button>
            ))}
          </nav>
          <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
            <LangSwitcher />
            <button type="button" onClick={() => go("services")} className="btn btn-orange" style={{ flex: 1 }}>{t("c_startplan")}</button>
          </div>
        </div>
      )}
    </header>
  );
};

Object.assign(window, { Header, LangSwitcher });
