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
 *               ~1.15 s), then removes itself from the DOM (`done`).
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

/** Same file and size as the header logo (`<Logo>`), so it is already cached. */
const LOGO_SRC = '/bt-logo.png'

const CSS = `
.bt-pl{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#fffbf8;pointer-events:none;animation:bt-pl-hide .25s ease .95s forwards}
html[data-pl=skip] .bt-pl,html[data-pl=done] .bt-pl{display:none}
html[data-pl=out] .bt-pl{opacity:0;visibility:hidden;transition:opacity .25s ease,visibility 0s linear .25s}
.bt-pl-in{display:grid;justify-items:center;gap:20px}
.bt-pl img{display:block;width:min(196px,52vw);height:auto;animation:bt-pl-logo .6s cubic-bezier(.2,.7,.2,1) both}
.bt-pl-bar{position:relative;width:72px;height:3px;border-radius:3px;background:rgba(38,85,46,.14);overflow:hidden}
.bt-pl-bar::after{content:"";position:absolute;top:0;bottom:0;left:0;width:40%;border-radius:3px;background:#ff9000;animation:bt-pl-sweep .9s cubic-bezier(.45,0,.2,1) infinite}
[dir=rtl] .bt-pl-bar::after{left:auto;right:0;animation-name:bt-pl-sweep-rtl}
@keyframes bt-pl-logo{from{opacity:0;transform:translateY(6px) scale(.97)}}
@keyframes bt-pl-sweep{from{transform:translateX(-110%)}to{transform:translateX(260%)}}
@keyframes bt-pl-sweep-rtl{from{transform:translateX(110%)}to{transform:translateX(-260%)}}
@keyframes bt-pl-hide{to{opacity:0;visibility:hidden}}
@media (prefers-reduced-motion:reduce){.bt-pl img,.bt-pl-bar::after{animation:none}.bt-pl-bar::after{width:100%}html[data-pl=out] .bt-pl{transition:none}}
`

const BOTS =
  'bot|crawl|spider|slurp|lighthouse|headless|pagespeed|preview|facebookexternalhit|embedly|validator|whatsapp|telegram|discord|skype'

/** Inline <head> script: decides `show` / `skip`, then fades and removes. */
export function preloaderHeadScript(): string {
  return `(function(){var d=document.documentElement,s='skip';try{if(new RegExp('${BOTS}','i').test(navigator.userAgent||''))throw 0;if(/^\\/(?:ar|en|id)\\/(?:checkout|map)(?:\\/|$)/.test(location.pathname))throw 0;if(sessionStorage.getItem('bt-pl'))throw 0;sessionStorage.setItem('bt-pl','1');s='show'}catch(e){}d.setAttribute('data-pl',s);if(s!=='show')return;var done=0,rm=matchMedia('(prefers-reduced-motion: reduce)').matches;function out(){if(done)return;done=1;setTimeout(function(){d.setAttribute('data-pl','out');setTimeout(function(){var el=document.getElementById('bt-pl');if(el&&el.parentNode)el.parentNode.removeChild(el);d.setAttribute('data-pl','done')},rm?0:260)},rm?0:Math.max(0,450-performance.now()))}document.addEventListener('DOMContentLoaded',out);setTimeout(out,Math.max(0,900-performance.now()))})();`
}

/** <style> + <script> for <head>. */
export function PreloaderHead() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script dangerouslySetInnerHTML={{ __html: preloaderHeadScript() }} />
    </>
  )
}

/** First child of <body>. */
export function PreloaderHost() {
  const html = `<div class="bt-pl" id="bt-pl" aria-hidden="true"><div class="bt-pl-in"><img src="${LOGO_SRC}" alt="" width="1202" height="352" decoding="async"><span class="bt-pl-bar"></span></div></div>`
  return <div id="bt-pl-host" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
}
