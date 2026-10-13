'use client'

/**
 * حماية المحتوى المدفوع من النسخ (الوثيقة 17) — مشتركة بين الخريطة والمقالات
 * الحصرية، وللمستخدم المسجّل فقط.
 *
 *  - لا قائمة زر أيمن ولا تحديد نص (الحقول مستثناة)
 *  - Ctrl/⌘+C (والقص) لا ينسخ شيئاً من المنطقة المحمية
 *  - علامة مائية خفيفة متكررة بالبريد/الجوال والتاريخ، لا تلتقط المؤشر —
 *    لقطة الشاشة تحمل هوية صاحبها.
 *
 * هذا ردع لا جدار: الجدار الحقيقي هو التنقيح على الخادم (المقفل لا يصل
 * للمتصفح أصلاً). المقصود ألا يكون نسخ ما دفع المشترك ثمنه بلا أثر.
 */

import { useMemo } from 'react'
import type { ClipboardEvent, CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react'

/** حقل يكتب فيه المستخدم: النسخ والقائمة مسموحان فيه. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest('input, textarea, select') !== null
}

function block(event: { target: EventTarget | null; preventDefault: () => void }) {
  if (!isEditable(event.target)) event.preventDefault()
}

/** معالجات تُفرد على العنصر المحمي. فارغة لغير المسجّل. */
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
 * وغامق) كي تُقرأ العلامة فوق الخلفيات الداكنة والفاتحة معاً.
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

/**
 * العلامة المائية فوق العنصر الأب (`position: relative`). `label` = "البريد · التاريخ".
 * `.bt-watermark` في components.css يضعها فوق كل شيء ولا تلتقط المؤشر.
 */
export function Watermark({ label }: { label: string }) {
  const style = useMemo(() => ({ backgroundImage: watermarkTile(label) }), [label])
  return <div className="bt-watermark" aria-hidden="true" style={style} />
}

const PROTECTED_STYLE: CSSProperties = {
  position: 'relative',
  // سياق تكديس خاص: العلامة المائية تبقى فوق النص لا فوق رأس الصفحة.
  isolation: 'isolate',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
}

/**
 * غلاف لمحتوى نصي محمي (المقالات الحصرية). `label` = null → يعرض المحتوى كما هو.
 * الطباعة: يُخفى المحتوى ويظهر `printNote` (عبر `<style>` يرفعه React إلى الرأس).
 */
export function ProtectedContent({
  label,
  printNote,
  className,
  children,
}: {
  label: string | null
  printNote?: string
  className?: string
  children: ReactNode
}) {
  if (label === null) return <div className={className}>{children}</div>
  return (
    <div
      className={className ? `bt-protected ${className}` : 'bt-protected'}
      style={PROTECTED_STYLE}
      {...protectionHandlers(true)}
    >
      <style href="bt-protected-print" precedence="default">
        {`.bt-protected-printnote{display:none}@media print{.bt-protected>:not(.bt-protected-printnote){display:none!important}.bt-protected .bt-protected-printnote{display:block;padding:24px;text-align:center;color:#000}}`}
      </style>
      {children}
      {printNote !== undefined && <p className="bt-protected-printnote">{printNote}</p>}
      <Watermark label={label} />
    </div>
  )
}
