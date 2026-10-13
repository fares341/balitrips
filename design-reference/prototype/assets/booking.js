/* =====================================================================
   BALI TRIPS — Booking components: Calendar (single / range), Stepper,
   price helpers. Used by activity, driver, package and custom-trip pages.
   ===================================================================== */
(function () {
const { L, LANG, icon, numAr } = BT;
const iso = (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const parse = (s) => new Date(s + "T00:00:00");
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/* Calendar: Booking-style month grid.
   opts: { mode: 'single'|'range', value: 'YYYY-MM-DD' | [a,b], unavailable: (iso)=>bool, months: 1|2, onChange, minNights } */
function Calendar(host, opts) {
  const o = Object.assign({ mode: "single", months: 1, unavailable: () => false }, opts);
  let view = today(); view.setDate(1);
  let a = null, b = null;
  if (o.mode === "single" && o.value) { a = o.value; view = parse(o.value); view.setDate(1); }
  if (o.mode === "range" && o.value) { [a, b] = o.value; if (a) { view = parse(a); view.setDate(1); } }
  const dows = LANG === "ar" ? ["ح", "ن", "ث", "ر", "خ", "ج", "س"] : ["S", "M", "T", "W", "T", "F", "S"];
  function month(base) {
    const y = base.getFullYear(), m = base.getMonth();
    const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    const title = first.toLocaleDateString(LANG === "ar" ? "ar-EG" : "en-GB", { month: "long", year: "numeric" });
    let cells = ""; for (let i = 0; i < first.getDay(); i++) cells += "<span></span>";
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, m, d), k = iso(dt), past = dt < today(), un = !past && o.unavailable(k);
      let cls = "cd";
      if (past) cls += " past"; if (un) cls += " un";
      if (k === a) cls += " sel s-a"; if (k === b) cls += " sel s-b";
      if (a && b && k > a && k < b) cls += " in";
      if (k === iso(today())) cls += " today";
      cells += `<button type="button" class="${cls}" data-d="${k}" ${past || un ? "disabled" : ""} aria-pressed="${k === a || k === b}" aria-label="${dt.toLocaleDateString(LANG === "ar" ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}${un ? " — " + L("غير متاح", "unavailable") : ""}"><span class="num">${LANG === "ar" ? numAr(d) : d}</span></button>`;
    }
    return `<div class="cal-m"><div class="cal-t">${title}</div><div class="cal-g">${dows.map(x => `<span class="dw">${x}</span>`).join("")}${cells}</div></div>`;
  }
  function render() {
    const m2 = new Date(view); m2.setMonth(m2.getMonth() + 1);
    const canPrev = view > today();
    host.innerHTML = `<div class="cal ${o.months === 2 ? "two" : ""}">
      <div class="cal-nav"><button type="button" class="icon-btn" data-nav="-1" ${canPrev ? "" : "disabled"} aria-label="${L("الشهر السابق", "Previous month")}"><span style="display:grid;transform:scaleX(${LANG === "ar" ? 1 : -1})">${icon("chev", 18)}</span></button><button type="button" class="icon-btn" data-nav="1" aria-label="${L("الشهر التالي", "Next month")}"><span style="display:grid;transform:scaleX(${LANG === "ar" ? -1 : 1})">${icon("chev", 18)}</span></button></div>
      <div class="cal-ms">${month(view)}${o.months === 2 ? month(m2) : ""}</div>
      <div class="cal-leg"><span><i class="lg-sel"></i>${L("مختار", "Selected")}</span><span><i class="lg-un"></i>${L("غير متاح", "Unavailable")}</span>${o.mode === "range" ? `<span class="muted">${a && !b ? L("اختر تاريخ النهاية", "Pick an end date") : ""}</span>` : ""}</div></div>`;
  }
  host.addEventListener("click", (e) => {
    const n = e.target.closest("[data-nav]"); if (n) { view.setMonth(view.getMonth() + (+n.dataset.nav)); render(); return; }
    const c = e.target.closest("[data-d]"); if (!c || c.disabled) return;
    const k = c.dataset.d;
    if (o.mode === "single") { a = k; }
    else {
      if (!a || (a && b) || k < a) { a = k; b = null; }
      else { // block ranges that cross unavailable days
        let d = parse(a), ok = true; while (iso(d) < k) { d.setDate(d.getDate() + 1); if (o.unavailable(iso(d))) { ok = false; break; } }
        if (!ok) { BT.toast(L("المدة تشمل يومًا غير متاح. اختر نطاقًا آخر.", "That range includes an unavailable day. Pick another range."), { err: true }); return; }
        b = k;
      }
    }
    render(); o.onChange && o.onChange(o.mode === "single" ? a : [a, b]);
  });
  render();
  return { get: () => (o.mode === "single" ? a : [a, b]), set: (v) => { if (o.mode === "single") a = v; else [a, b] = v; render(); } };
}

/* Stepper */
function Stepper(host, { value = 1, min = 0, max = 20, label = "", onChange }) {
  let v = value;
  host.innerHTML = `<div class="stepper" role="group" aria-label="${label}"><button type="button" data-s="-1" aria-label="${L("إنقاص", "Decrease")} ${label}">${icon("minus", 18, 2)}</button><output aria-live="polite">${v}</output><button type="button" data-s="1" aria-label="${L("زيادة", "Increase")} ${label}">${icon("plus", 18, 2)}</button></div>`;
  const out = host.querySelector("output"), [mi, pl] = host.querySelectorAll("button");
  const upd = () => { out.textContent = v; mi.disabled = v <= min; pl.disabled = v >= max; };
  host.addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (!b) return; v = Math.max(min, Math.min(max, v + (+b.dataset.s))); upd(); onChange && onChange(v); });
  upd();
  return { get: () => v, set: (x) => { v = x; upd(); }, setMax: (m) => { max = m; if (v > m) { v = m; onChange && onChange(v); } upd(); } };
}

const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5) + 1;
const vehicleFor = (n) => BT.D.VEHICLES.find(v => n >= v.min && n <= v.max) || BT.D.VEHICLES[BT.D.VEHICLES.length - 1];
/* Demo availability: Tuesdays + a couple of fixed dates are unavailable */
const demoUnavailable = (seed) => (k) => { const d = parse(k); const n = d.getDate() + (seed || 0); return d.getDay() === 2 || n % 11 === 0; };

BT.Calendar = Calendar; BT.Stepper = Stepper; BT.daysBetween = daysBetween; BT.vehicleFor = vehicleFor; BT.demoUnavailable = demoUnavailable; BT.iso = iso; BT.parseDate = parse; BT.today = today;
})();
