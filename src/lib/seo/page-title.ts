/**
 * The layout appends « · Bali Trips» to every page title (`%s · Bali Trips`).
 * Studio SEO titles are often written with the brand already on the end
 * («… | Bali Trips»), which produced «… | Bali Trips · Bali Trips». This
 * removes a trailing brand (with |, ·, -, – or — before it) so the template
 * adds it exactly once.
 */
export function stripBrandSuffix(title: string): string {
  const stripped = title.replace(/\s*[|·\-–—:]\s*(?:Bali\s*Trips|بالي\s*تريبس)\s*$/iu, '').trim()
  return stripped === '' ? title.trim() : stripped
}
