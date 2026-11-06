'use client'

/**
 * Last-resort error screen, for an error in the root/locale layout itself
 * (where src/app/[locale]/error.tsx cannot render). It replaces the whole
 * document, so it carries its own <html>, minimal inline styles in the brand
 * palette, and the three languages picked from the URL — no message files,
 * no providers, nothing that could fail a second time.
 */

import { useEffect, useSyncExternalStore } from 'react'

const COPY = {
  ar: {
    dir: 'rtl',
    title: 'تعذّر تحميل الصفحة الآن',
    body: 'حدث خلل مؤقت من جهتنا. جرّب مرة أخرى بعد لحظات.',
    retry: 'حاول مرة أخرى',
    home: 'العودة للرئيسية',
  },
  en: {
    dir: 'ltr',
    title: "This page couldn't load right now",
    body: 'Something went wrong on our side. Please try again in a moment.',
    retry: 'Try again',
    home: 'Back to home',
  },
  id: {
    dir: 'ltr',
    title: 'Halaman ini belum bisa dimuat',
    body: 'Ada gangguan sementara di sisi kami. Silakan coba lagi sebentar lagi.',
    retry: 'Coba lagi',
    home: 'Kembali ke beranda',
  },
} as const

type Lang = keyof typeof COPY

const noop = () => () => {}
const readLang = (): Lang => {
  const first = window.location.pathname.split('/')[1]
  return first === 'en' || first === 'id' ? first : 'ar'
}

export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string }
  retry?: () => void
  reset?: () => void
}) {
  const lang = useSyncExternalStore(noop, readLang, () => 'ar' as Lang)
  const c = COPY[lang]
  const again = retry ?? reset

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang={lang} dir={c.dir}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#fffbf8',
          color: '#1c2a1f',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif',
          padding: 16,
        }}
      >
        <title>{`${c.title} · Bali Trips`}</title>
        <main style={{ maxWidth: 520, textAlign: 'center' }}>
          <div
            aria-hidden="true"
            dir="ltr"
            style={{ font: '800 88px/1 system-ui, sans-serif', color: '#26552e' }}
          >
            5<span style={{ color: '#ff9000' }}>0</span>0
          </div>
          <h1 style={{ fontSize: 24, margin: '16px 0 8px', color: '#1b3f22' }}>{c.title}</h1>
          <p style={{ margin: '0 0 20px', color: '#5f6e62', lineHeight: 1.6 }}>{c.body}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {again !== undefined && (
              <button
                type="button"
                onClick={() => again()}
                style={{
                  minHeight: 44,
                  padding: '0 20px',
                  borderRadius: 999,
                  border: 0,
                  background: '#ff9000',
                  color: '#13301a',
                  font: 'inherit',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {c.retry}
              </button>
            )}
            {/* A full page load on purpose: the app shell itself failed. */}
            <a
              href={`/${lang}`}
              style={{
                minHeight: 44,
                padding: '0 20px',
                borderRadius: 999,
                border: '1.5px solid #26552e',
                color: '#26552e',
                display: 'inline-flex',
                alignItems: 'center',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {c.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
