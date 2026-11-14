/**
 * «Bali Trips» preloader — the logo and a short orange sweep on the ivory
 * ground, over the first paint of the FIRST page of a visit only.
 *
 * - Server-rendered (static HTML), so it is up before any JavaScript.
 * - `preloaderHeadScript()` runs in <head> before the body is parsed and sets
 *   `data-pl` on <html>:
 *     `skip`  — already seen this session (sessionStorage `bt-pl`), storage
 *               blocked, a bot or audit tool, /checkout or the map;
 *     `show`  — first page of the session: it fades out on DOMContentLoaded
 *               (at least ~0.45 s on screen so it does not flash, at most
 *               ~1.15 s, both counted from when it first shows), then
 *               removes itself from the DOM (`done`).
 * - Without JavaScript a CSS animation hides it after 1.2 s.
 * - `pointer-events: none` throughout: it never blocks a tap.
 * - Reduced motion: no logo or sweep animation, no minimum time.
 * - In-app navigations never show it: the layout (and this markup) persists,
 *   and `done` keeps it hidden if React ever renders the host again.
 *
 * The overlay lives inside a `dangerouslySetInnerHTML` host, so removing it
 * is invisible to React (no hydration or reconciliation conflict).
 *
 * To turn it off: remove <PreloaderHead /> and <PreloaderHost /> from the
 * locale layout.
 */

/*
 * Styles: src/styles/bt-preloader.css. The logo there is a 3.5 kB inlined
 * copy set as a CSS background, so it needs no request. An <img
 * src="/bt-logo.png"> here was fetched on every page, even when skipped, and
 * at high priority: the 36 kB PNG competed with the hero photo and delayed
 * LCP by ~0.4 s.
 */

const BOTS =
  'bot|crawl|spider|slurp|lighthouse|headless|pagespeed|preview|facebookexternalhit|embedly|validator|whatsapp|telegram|discord|skype'

/** Inline <head> script: decides `show` / `skip`, then fades and removes. */
export function preloaderHeadScript(): string {
  return `(function(){var d=document.documentElement,s='skip';try{if(new RegExp('${BOTS}','i').test(navigator.userAgent||''))throw 0;if(/^\\/(?:ar|en|id)\\/(?:checkout|map)(?:\\/|$)/.test(location.pathname))throw 0;if(sessionStorage.getItem('bt-pl'))throw 0;sessionStorage.setItem('bt-pl','1');s='show'}catch(e){}d.setAttribute('data-pl',s);if(s!=='show')return;var done=0,t0=performance.now(),rm=matchMedia('(prefers-reduced-motion: reduce)').matches;function out(){if(done)return;done=1;setTimeout(function(){d.setAttribute('data-pl','out');setTimeout(function(){var el=document.getElementById('bt-pl');if(el&&el.parentNode)el.parentNode.removeChild(el);d.setAttribute('data-pl','done')},rm?0:260)},rm?0:Math.max(0,450-(performance.now()-t0)))}document.addEventListener('DOMContentLoaded',out);setTimeout(out,900)})();`
}

/** <script> for <head>. */
export function PreloaderHead() {
  return <script dangerouslySetInnerHTML={{ __html: preloaderHeadScript() }} />
}

/** First child of <body>. */
export function PreloaderHost() {
  const html = `<div class="bt-pl" id="bt-pl" aria-hidden="true"><div class="bt-pl-in"><span class="bt-pl-logo"></span><span class="bt-pl-bar"></span></div></div>`
  return <div id="bt-pl-host" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
}
