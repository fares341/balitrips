/* ============================================================
   MAP — standalone page. Satellite imagery + GPS pins, pan/zoom.
   Freemium: free cluster interactive, rest locked behind a
   conversion overlay. Node → detail panel (fav / trip / drill).
   ============================================================ */

const SAT_URL2 = (typeof window !== "undefined" && window.BT_SAT) || "assets/bali-satellite.jpg";
const mprojX = (lon) => (lon - MAP_BBOX.w) / (MAP_BBOX.e - MAP_BBOX.w) * 100;
const mprojY = (lat) => (MAP_BBOX.n - lat) / (MAP_BBOX.n - MAP_BBOX.s) * 100;
MAP_PLACES.forEach((p) => { p.nx = mprojX(p.lon); p.ny = mprojY(p.lat); });
const mColor = (tags) => tags.includes("Beaches") ? "#36c6e0" : tags.includes("Temples") ? "#FF9000" : tags.includes("Hiking") ? "#71FF85" : "#FFD27A";
const mclamp = (v, a, b) => Math.max(a, Math.min(b, v));

const MapPage = () => {
  const { t, lang, navigate, addToTrip, toggleFav, isFav, toast, mapUnlocked, unlockMap } = useBT();
  const [filter, setFilter] = React.useState("All");
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(null);
  const [narrow, setNarrow] = React.useState(false);
  const [view, setView] = React.useState({ s: 1, x: 0, y: 0 });
  const frameRef = React.useRef(null);
  const gesture = React.useRef({ pointers: new Map(), panStart: null, pinchDist: 0, moved: false });

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const on = () => setNarrow(mq.matches); on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const clampView = (v) => {
    const f = frameRef.current; if (!f) return v;
    const W = f.clientWidth, H = f.clientHeight;
    return { s: v.s, x: mclamp(v.x, W * (1 - v.s), 0), y: mclamp(v.y, H * (1 - v.s), 0) };
  };
  const zoomAt = (cx, cy, factor) => setView((v) => {
    const ns = mclamp(v.s * factor, 1, 5); if (ns === v.s) return v;
    const k = ns / v.s; return clampView({ s: ns, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
  });
  React.useEffect(() => {
    const f = frameRef.current; if (!f) return;
    const onWheel = (e) => { e.preventDefault(); const r = f.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18); };
    f.addEventListener("wheel", onWheel, { passive: false });
    return () => f.removeEventListener("wheel", onWheel);
  }, []);
  const rel = (e) => { const r = frameRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onPointerDown = (e) => {
    const g = gesture.current; g.pointers.set(e.pointerId, rel(e)); g.moved = false;
    if (g.pointers.size === 1) setView((v) => { g.panStart = { x: v.x, y: v.y, p: rel(e) }; return v; });
    else if (g.pointers.size === 2) { const pts = [...g.pointers.values()]; g.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onPointerMove = (e) => {
    const g = gesture.current; if (!g.pointers.has(e.pointerId)) return; g.pointers.set(e.pointerId, rel(e));
    if (g.pointers.size === 2) { const pts = [...g.pointers.values()]; const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (g.pinchDist > 0) { const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2; zoomAt(mx, my, d / g.pinchDist); } g.pinchDist = d; g.moved = true;
    } else if (g.panStart) { const p = rel(e); const dx = p.x - g.panStart.p.x, dy = p.y - g.panStart.p.y; if (Math.abs(dx) + Math.abs(dy) > 5) g.moved = true; setView((v) => clampView({ s: v.s, x: g.panStart.x + dx, y: g.panStart.y + dy })); }
  };
  const onPointerUp = (e) => { const g = gesture.current; g.pointers.delete(e.pointerId); if (g.pointers.size < 2) g.pinchDist = 0; if (g.pointers.size === 0) g.panStart = null; };

  const isLocked = (p) => !p.free && !mapUnlocked;
  const pickPin = (p) => { if (gesture.current.moved) return; if (isLocked(p)) return; setActive(active === p.id ? null : p.id); };
  const matches = (p) => {
    if (filter !== "All" && !p.tags.includes(filter)) return false;
    if (query.trim()) { const q = query.toLowerCase(); if (!`${p.name[lang]} ${p.name.en} ${p.cat[lang]}`.toLowerCase().includes(q)) return false; }
    return true;
  };
  const stageStyle = { transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: "0 0" };
  const activePlace = MAP_PLACES.find((p) => p.id === active);
  const lockedCount = MAP_PLACES.filter((p) => !p.free).length;

  return (
    <React.Fragment>
      <PageBanner image="tegallalang,rice" seed={4} tag={t("map_eyebrow")} title={t("mp_title")} subtitle={t("mp_sub")}
        trail={[{ label: t("c_home"), to: "home" }, { label: t("navr_map") }]}>
        <div className="row" style={{ gap: 10, marginTop: 18 }}>
          <span className="tag tag-palm"><span className="bt-legend-dot" style={{ background: "var(--palm)" }}></span> {t("mp_free")}</span>
          <span className="tag" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }}><Icon name="lock" size={13} color="#fff" /> {lockedCount} {t("mp_locked")}</span>
        </div>
      </PageBanner>

      <section className="bg-forest" style={{ overflow: "hidden", paddingTop: 40 }}>
        <div className="bt-mapwrap" style={{ marginTop: 0 }}>
          <div className="bt-mapframe" ref={frameRef}>
            <div className={`bt-stage ${gesture.current.panStart ? "grabbing" : ""}`} style={stageStyle}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#0c4a63,#072a3e)" }}>
                <img src={SAT_URL2} alt="Satellite map of Bali" draggable="false" onError={(e) => { e.target.style.display = "none"; }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }} />
              </div>

              {MAP_PLACES.map((p) => {
                const on = matches(p), locked = isLocked(p), hot = active === p.id;
                return (
                  <button key={p.id} onClick={() => pickPin(p)}
                    className={`bt-node ${hot ? "hot" : ""}`} style={{ left: `${p.nx}%`, top: `${p.ny}%`, opacity: on ? 1 : 0.2, cursor: locked ? "not-allowed" : "pointer" }}>
                    {!locked && <span className="bt-node-pulse" style={{ background: mColor(p.tags) }}></span>}
                    <span className="bt-node-dot" style={{ background: locked ? "rgba(255,255,255,.5)" : mColor(p.tags), width: hot ? 18 : 14, height: hot ? 18 : 14 }}></span>
                    {locked && <span className="bt-node-lock"><Icon name="lock" size={9} color="#fff" /></span>}
                  </button>
                );
              })}

              {!narrow && MAP_PLACES.map((p, i) => {
                const on = matches(p), locked = isLocked(p), hot = active === p.id;
                const tx = p.side === "left" ? "-100%" : "0";
                return (
                  <button key={"c" + p.id} onClick={() => pickPin(p)}
                    onMouseEnter={() => !locked && setActive(p.id)}
                    className={`bt-pcard in ${on ? "" : "dim"} ${hot ? "hot" : ""} ${locked ? "locked" : ""}`}
                    style={{ left: `${p.ax}%`, top: `${p.ay}%`, "--tx": tx, transform: `translate(${tx}, -50%)` }}>
                    <span className="bt-pthumb" style={{ filter: locked ? "blur(4px)" : "none" }}><Photo src={flickr(p.flickr, 200, 200, 40 + i)} alt="" /></span>
                    <span className="bt-pmeta">
                      <span className="bt-pname">{locked ? "•••••" : p.name[lang]}</span>
                      <span className="bt-pcat">{locked ? t("mp_locked") : p.cat[lang]}</span>
                      {!locked && <span className="bt-prate"><span style={{ color: "#FFD27A" }}>★ {p.rating}</span></span>}
                    </span>
                    {locked && <span className="bt-pcard-lock"><Icon name="lock" size={14} color="#fff" /></span>}
                  </button>
                );
              })}
            </div>

            {/* fixed HUD */}
            <div className="bt-mapui">
              <div className="bt-mapsearch"><Icon name="search" size={19} color="#5b6b5c" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("map_search")} /></div>
              <div className="bt-mapchips">{MAP_FILTERS.map((f) => <button key={f.key} onClick={() => setFilter(f.key)} className={`bt-mchip ${filter === f.key ? "on" : ""}`}>{f.label[lang]}</button>)}</div>
            </div>

            <div className="bt-zoom">
              <button onClick={() => { const f = frameRef.current; zoomAt(f.clientWidth / 2, f.clientHeight / 2, 1.4); }} aria-label="Zoom in"><Icon name="plus" size={18} color="#fff" /></button>
              <button onClick={() => { const f = frameRef.current; zoomAt(f.clientWidth / 2, f.clientHeight / 2, 1 / 1.4); }} aria-label="Zoom out"><span className="bt-minus"></span></button>
              <button onClick={() => setView({ s: 1, x: 0, y: 0 })} aria-label="Reset" className={view.s > 1.01 ? "" : "off"}><Icon name="compass" size={17} color="#fff" /></button>
            </div>

            {mapUnlocked ? (
              <div className="bt-mapcount" style={{ background: "var(--palm)", color: "var(--forest-deep)" }}><Icon name="check" size={13} color="var(--forest-deep)" /> {t("mp_unlocked")}</div>
            ) : (
              <div className="bt-paywall">
                <span className="bt-paywall-ic"><Icon name="lock" size={20} color="#fff" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{t("mp_locked")}</div>
                  <div style={{ fontSize: 12.5, opacity: 0.85 }}>{t("mp_locked_b")}</div>
                </div>
                <button className="btn btn-orange" style={{ minHeight: 42, whiteSpace: "normal" }} onClick={() => navigate("plans")}>{t("mp_unlock")}</button>
              </div>
            )}

            {/* node detail panel */}
            {activePlace && <MapNodePanel p={activePlace} onClose={() => setActive(null)} />}
          </div>
          <div className="bt-maptip" style={{ color: "rgba(255,251,248,0.6)" }}>{t("mp_hint")}</div>
        </div>
      </section>
    </React.Fragment>
  );
};

const MapNodePanel = ({ p, onClose }) => {
  const { t, lang, navigate, addToTrip, toggleFav, isFav, toast } = useBT();
  const act = p.actId ? findActivity(p.actId) : null;
  const gallery = act ? act.gallery : [p.flickr, "bali,beach", "bali,jungle"];
  const faved = isFav(p.id);
  return (
    <div className="bt-nodepanel" role="dialog">
      <button className="bt-modal-x" style={{ position: "absolute", top: 12, insetInlineEnd: 12, zIndex: 3 }} onClick={onClose}><Icon name="cross" size={18} /></button>
      <div className="bt-nodepanel-hero"><Photo src={flickr(gallery[0], 600, 400, 6)} alt={p.name[lang]} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} /></div>
      <div className="bt-nodepanel-body">
        <div className="row" style={{ gap: 8 }}>
          <span className="tag tag-forest">{p.cat[lang]}</span>
          <span className="tag tag-palm">{(REGIONS[p.region] || {})[lang]}</span>
        </div>
        <h3 style={{ fontSize: 22, marginTop: 10 }}>{p.name[lang]}</h3>
        <div style={{ marginTop: 4 }}><Rating value={p.rating} /> <span className="muted" style={{ fontSize: 12.5 }}>· {p.hours}</span></div>
        {act && <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>{act.desc[lang]}</p>}
        <div className="bt-nodepanel-gal">{gallery.slice(0, 3).map((g, i) => <Photo key={i} src={flickr(g, 200, 200, 50 + i)} alt="" radius={10} style={{ height: 60 }} />)}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className={`btn ${faved ? "btn-forest" : "btn-ghost"}`} style={{ minHeight: 44, fontSize: 13.5, padding: "10px 14px" }} onClick={() => { toggleFav(p.id); }}>
            <Icon name="heart" size={16} color={faved ? "#fff" : "var(--forest)"} /> {faved ? t("mp_faved") : t("mp_addfav")}
          </button>
          <button className="btn btn-orange" style={{ flex: 1, minHeight: 44, fontSize: 13.5, padding: "10px" }} onClick={() => { addToTrip(mkPlace(p)); toast(t("c_added")); }}>
            <Icon name="plus" size={16} color="#fff" /> {t("mp_addtrip")}
          </button>
        </div>
        {act && <button className="btn btn-ghost btn-block" style={{ marginTop: 10, minHeight: 42, fontSize: 13.5 }} onClick={() => navigate("activity", { id: act.id })}>{t("mp_detail")} <Icon name="arrow" size={15} className="flip" /></button>}
      </div>
    </div>
  );
};

Object.assign(window, { MapPage });
