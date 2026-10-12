/* ============================================================
   Account dropdown (from header icon) — logged-in menu + logout
   ============================================================ */

const AccountMenu = ({ t, lang, user, onOpenAccount, onSignOut, onClose }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const close = (e) => { if (e.target.closest && e.target.closest(".bt-acctmenu, .bt-iconbtn")) return; onClose(); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const initials = (user.name || "T").trim().charAt(0).toUpperCase();
  const items = [
    { key: "profile", icon: "user",   label: "acct_nav_profile" },
    { key: "fav",     icon: "heart",  label: "acct_nav_fav" },
    { key: "trip",    icon: "route",  label: "acct_nav_trip" },
    { key: "sched",   icon: "cal",    label: "acct_nav_sched" },
    { key: "subs",    icon: "star",   label: "acct_nav_subs" },
    { key: "inv",     icon: "pdf",    label: "acct_nav_inv" },
  ];

  return (
    <div ref={ref} className="bt-acctmenu" role="menu">
      <div className="bt-acctmenu-head">
        <span className="bt-avatar">{initials}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--forest)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
          <div className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
        </div>
      </div>
      <div className="bt-acctmenu-list">
        {items.map((it) => (
          <button key={it.key} onClick={() => onOpenAccount(it.key)} role="menuitem">
            <Icon name={it.icon} size={17} color="var(--forest-soft)" />
            <span>{t(it.label)}</span>
          </button>
        ))}
      </div>
      <div className="bt-acctmenu-foot">
        <button onClick={onSignOut} role="menuitem">
          <Icon name="arrow" size={17} color="var(--orange-deep)" className="flip" />
          <span>{t("acct_signout")}</span>
        </button>
      </div>
    </div>
  );
};

Object.assign(window, { AccountMenu });
