'use client'

/**
 * حماية الخريطة المدفوعة من النسخ (الوثيقة 17) — للمستخدم المسجّل فقط.
 *
 *  - لا قائمة زر أيمن ولا تحديد نص على إطار الخريطة ولوحة المكان (الحقول مستثناة)
 *  - Ctrl/⌘+C (والقص) لا ينسخ شيئاً من منطقة الخريطة
 *  - الطباعة تعرض رسالة بدل الخريطة (CSS: `.bt-map-protected` في components.css)
 *  - علامة مائية خفيفة متكررة بالبريد والتاريخ، فوق المسطحة والثلاثية،
 *    لا تلتقط المؤشر — لقطة الشاشة تحمل هوية صاحبها.
 *
 * هذا ردع لا جدار: الجدار الحقيقي هو التنقيح على الخادم (المقفل لا يصل
 * للمتصفح أصلاً). المقصود ألا يكون نسخ ما دفع المشترك ثمنه بلا أثر.
 */

import { useMemo } from 'react'
import type { ClipboardEvent, KeyboardEvent, MouseEvent } from 'react'

/** حقل يكتب فيه المستخدم: النسخ والقائمة مسموحان فيه. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest('input, textarea, select') !== null
}

function block(event: { target: EventTarget | null; preventDefault: () => void }) {
  if (!isEditable(event.target)) event.preventDefault()
}

/** معالجات تُفرد على `.bt-mapframe`. فارغة لغير المسجّل. */
export function protectionHandlers(enabled: boolean) {
  if (!enabled) return {}
  return {
    onContextMenu: (event: MouseEvent) => block(event),
    onCopy: (event: ClipboardEvent) => block(event),
    onCut: (event: ClipboardEvent) => block(event),
    onKeyDown: (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && (key === 'c' || key === 'x')) block(event)
    },
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/**
 * بلاطة SVG واحدة مائلة، تكررها `background-repeat`. نصان متراكبان (فاتح
 * وغامق) كي تُقرأ العلامة فوق البحر الداكن والشاطئ الفاتح معاً.
 */
function watermarkTile(label: string): string {
  const text = escapeXml(label)
  const width = Math.max(320, Math.round(label.length * 7.5) + 80)
  const height = Math.round(width * 0.6)
  const cx = width / 2
  const cy = height / 2
  const common = `x='${cx}' y='${cy}' text-anchor='middle' dominant-baseline='middle' font-family='system-ui, sans-serif' font-size='13' transform='rotate(-28 ${cx} ${cy})'`
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>` +
    `<text ${common} dx='1' dy='1' fill='#000' fill-opacity='0.10'>${text}</text>` +
    `<text ${common} fill='#fff' fill-opacity='0.16'>${text}</text>` +
    `</svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

/** العلامة المائية فوق سطح الخريطة. `label` = "البريد · التاريخ". */
export function MapWatermark({ label }: { label: string }) {
  const style = useMemo(() => ({ backgroundImage: watermarkTile(label) }), [label])
  return <div className="bt-watermark" aria-hidden="true" style={style} />
}
