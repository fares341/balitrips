'use client'

/**
 * عارض PDF آمن داخل الموقع.
 *
 * - الصفحات تُرسم كصور على `<canvas>` عبر PDF.js، **بلا طبقة نص**: لا يوجد
 *   نص لتحديده أو نسخه.
 * - علامة مائية فوق المحتوى (بالإضافة للعلامة المختومة داخل الملف نفسه).
 * - تعطيل: النقر الأيمن، النسخ والقص، السحب، Ctrl/⌘ + P / S / C / A / U.
 * - الطباعة: CSS يخفي العارض في وضع الطباعة ويطبع رسالة بدلاً منه.
 *
 * هذه عوائق وليست حماية مطلقة (لقطة الشاشة وأدوات المطوّر ممكنة دائماً،
 * كما تقول الوثيقة). ما يجعل التسريب مكلفاً هو العلامة المائية والسجل.
 */

import { useEffect, useRef, useState } from 'react'

type Status = 'loading' | 'ready' | 'error'

interface Labels {
  loading: string
  error: string
  printBlocked: string
  page: string
}

const BLOCKED_KEYS = new Set(['p', 's', 'c', 'a', 'u', 'x'])

export function SecurePdfViewer({
  src,
  watermark,
  labels,
}: {
  src: string
  watermark: string
  labels: Labels
}) {
  const pagesRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [pageCount, setPageCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const container = pagesRef.current
    if (container === null) return

    async function render(target: HTMLDivElement) {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        const response = await fetch(src, { credentials: 'same-origin', cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = new Uint8Array(await response.arrayBuffer())

        const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
        if (cancelled) return
        setPageCount(doc.numPages)

        const width = Math.min(target.clientWidth || 900, 1000)
        const ratio = Math.min(window.devicePixelRatio || 1, 2)

        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (width / base.width) * ratio })

          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${Math.floor(viewport.width / ratio)}px`
          canvas.style.maxWidth = '100%'
          canvas.style.height = 'auto'
          canvas.setAttribute('aria-label', `${labels.page} ${n}`)
          canvas.setAttribute('role', 'img')
          canvas.className = 'bt-spv-page'

          const context = canvas.getContext('2d')
          if (context === null) throw new Error('no 2d context')
          await page.render({ canvas, canvasContext: context, viewport }).promise
          target.appendChild(canvas)
        }

        // البايتات لا تبقى في الذاكرة أكثر من اللازم.
        await doc.destroy()
        if (!cancelled) setStatus('ready')
      } catch (error) {
        console.error('[viewer]', error)
        if (!cancelled) setStatus('error')
      }
    }

    void render(container)
    return () => {
      cancelled = true
      container.replaceChildren()
    }
  }, [src, labels.page])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && BLOCKED_KEYS.has(event.key.toLowerCase())) {
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.key === 'PrintScreen') {
        // لا يمنع لقطة الشاشة، لكنه يمسح الحافظة في بعض المتصفحات.
        void navigator.clipboard?.writeText('').catch(() => undefined)
      }
    }
    const block = (event: Event) => event.preventDefault()
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
    }
  }, [])

  const block = (event: React.SyntheticEvent) => event.preventDefault()

  return (
    <div className="bt-spv">
      <style>{`
        .bt-spv { position: relative; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .bt-spv-pages { display: flex; flex-direction: column; align-items: center; gap: 16px; }
        .bt-spv-page { box-shadow: 0 1px 6px rgb(0 0 0 / 0.15); background: #fff; pointer-events: none; }
        .bt-spv-mark {
          position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 2;
          display: flex; flex-wrap: wrap; align-content: flex-start; gap: 80px 60px; padding: 40px;
        }
        .bt-spv-mark span {
          transform: rotate(-30deg); font-size: 14px; font-weight: 600; white-space: nowrap;
          color: rgb(0 0 0 / 0.09); unicode-bidi: plaintext;
        }
        .bt-spv-print { display: none; }
        @media print {
          .bt-spv-pages, .bt-spv-mark { display: none !important; }
          .bt-spv-print { display: block; padding: 48px; font-size: 18px; }
        }
      `}</style>

      <div
        onContextMenu={block}
        onDragStart={block}
        onCopy={block}
        onCut={block}
        style={{ position: 'relative', minHeight: 240 }}
      >
        <div ref={pagesRef} className="bt-spv-pages" aria-busy={status === 'loading'} />
        {status === 'ready' && (
          <div className="bt-spv-mark" aria-hidden="true">
            {Array.from({ length: Math.max(pageCount, 1) * 24 }, (_, i) => (
              <span key={i}>{watermark}</span>
            ))}
          </div>
        )}
      </div>

      {status === 'loading' && (
        <p role="status" className="muted">
          {labels.loading}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="muted">
          {labels.error}
        </p>
      )}
      <p className="bt-spv-print">{labels.printBlocked}</p>
    </div>
  )
}
