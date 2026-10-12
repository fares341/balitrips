/* ============================================================
   BALI TRIPS — App root: stateful router + global store.
   One <main> renders the current page; header/footer persist.
   ============================================================ */

const PAGES = {
  home:        (p) => <HomePage />,
  services:    (p) => <ServicesPage />,
  plans:       (p) => <SubscriptionsPage />,
  map:         (p) => <MapPage />,
  activities:  (p) => <ActivitiesPage params={p} />,
  activity:    (p) => <ActivityDetailPage params={p} />,
  driver:      (p) => <DriverPage />,
  itineraries: (p) => <ItinerariesPage />,
  itinerary:   (p) => <ItineraryDetailPage params={p} />,
  packages:    (p) => <PackagesPage />,
  package:     (p) => <PackageDetailPage params={p} />,
  custom:      (p) => <CustomPage />,
  about:       (p) => <AboutPage />,
  explore:     (p) => <ExplorePage />,
  contact:     (p) => <ContactPage />,
  blog:        (p) => <BlogPage />,
  article:     (p) => <ArticleDetailPage params={p} />,
  cart:        (p) => <CartPage />,
};

const readLS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };

function App() {
  const [lang, setLangState] = React.useState(() => localStorage.getItem("bt_lang") || "en");
  const [route, setRoute] = React.useState(() => (window.history.state && window.history.state.bt) || { name: "home", params: {} });
  const [user, setUser] = React.useState(() => loadUser());
  const [authMode, setAuthMode] = React.useState(null);
  const [acctTab, setAcctTab] = React.useState(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [cart, setCart] = React.useState(() => readLS("bt_cart", []));
  const [favs, setFavs] = React.useState(() => readLS("bt_favs", []));
  const [mapUnlocked, setMapUnlocked] = React.useState(() => readLS("bt_mapunlock", false));
  const [toastMsg, setToastMsg] = React.useState(null);
  const toastTimer = React.useRef(null);

  const t = React.useMemo(() => makeT(lang), [lang]);

  React.useEffect(() => {
    localStorage.setItem("bt_lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = LANGS[lang].dir;
  }, [lang]);
  React.useEffect(() => { localStorage.setItem("bt_cart", JSON.stringify(cart)); }, [cart]);
  React.useEffect(() => { localStorage.setItem("bt_favs", JSON.stringify(favs)); }, [favs]);
  React.useEffect(() => { localStorage.setItem("bt_mapunlock", JSON.stringify(mapUnlocked)); }, [mapUnlocked]);
  useReveal();

  // router
  const navigate = React.useCallback((name, params = {}) => {
    if (!PAGES[name]) name = "home";
    const next = { name, params };
    setRoute(next);
    setSearchOpen(false); setAcctTab(null);
    try { window.history.pushState({ bt: next }, "", "#" + name); } catch (e) {}
    window.scrollTo(0, 0);
  }, []);
  React.useEffect(() => {
    const onPop = (e) => { const r = (e.state && e.state.bt) || { name: "home", params: {} }; setRoute(r); window.scrollTo(0, 0); };
    window.addEventListener("popstate", onPop);
    if (!window.history.state || !window.history.state.bt) { try { window.history.replaceState({ bt: route }, "", "#" + route.name); } catch (e) {} }
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setLang = (l) => setLangState(l);

  // auth
  const openAuth = (mode) => setAuthMode(mode || "signin");
  const onAuthed = (u) => { setUser(u); saveUser(u); setAuthMode(null); };
  const signOut = () => { setUser(null); saveUser(null); setAcctTab(null); };
  const openAccount = (tab) => setAcctTab(tab || "profile");

  // cart
  const addToTrip = (item) => setCart((p) => [...p, item]);
  const removeFromTrip = (id) => setCart((p) => p.filter((x) => x.id !== id));
  const setQty = (id, q) => setCart((p) => p.map((x) => x.id === id ? { ...x, qty: q } : x));
  const clearCart = () => setCart([]);
  const cartCount = cart.reduce((s, it) => s + (it.qty || 1), 0);
  const cartTotal = cart.reduce((s, it) => s + (it.price * (it.qty || 1)), 0);

  // favorites
  const toggleFav = (id) => setFavs((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const isFav = (id) => favs.includes(id);

  // map
  const unlockMap = () => setMapUnlocked(true);

  // toast
  const toast = (msg) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400);
  };

  const openSearch = () => setSearchOpen(true);

  const ctx = {
    lang, setLang, t, dir: LANGS[lang].dir,
    route, navigate,
    user, openAuth, signOut, openAccount,
    cart, addToTrip, removeFromTrip, setQty, clearCart, cartCount, cartTotal,
    favs, toggleFav, isFav,
    mapUnlocked, unlockMap,
    toast, openSearch,
  };

  const render = PAGES[route.name] || PAGES.home;

  return (
    <BT.Provider value={ctx}>
      <Header />
      <main key={route.name + JSON.stringify(route.params)}>{render(route.params)}</main>
      <Footer />

      {authMode && <AuthModal t={t} lang={lang} mode={authMode} setMode={setAuthMode} onClose={() => setAuthMode(null)} onAuthed={onAuthed} />}
      {acctTab && user && <AccountPanel t={t} lang={lang} user={user} tab={acctTab} setTab={setAcctTab} onClose={() => setAcctTab(null)} onSignOut={signOut} setUser={setUser} tripItems={cart} />}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
      {toastMsg && <Toast msg={toastMsg} />}
    </BT.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
