'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { useAdminT } from '../../../_ui/i18n-provider'

const LANGS = [
  { key: 'ar', label: 'العربية' },
  { key: 'en', label: 'English' },
  { key: 'id', label: 'Indonesia' },
] as const

/**
 * Drag & drop PDF upload with a progress bar. Posts to the tab's route
 * (`[id]/pdf`), which runs the same checks as the form action, then
 * reloads the tab with the outcome (`?ok=` / `?err=`, shown by <Flash>).
 * Size and type are also checked here first, with a clear message.
 */
export function PdfDropzone({
  uploadUrl,
  tabUrl,
  maxMb,
}: {
  uploadUrl: string
  tabUrl: string
  maxMb: number
}) {
  const { t } = useAdminT()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [locale, setLocale] = useState('ar')
  const [notify, setNotify] = useState(false)
  const [over, setOver] = useState(false)
  const [pct, setPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = (picked: File | null | undefined) => {
    setError(null)
    if (!picked) return
    if (picked.type !== 'application/pdf' && !picked.name.toLowerCase().endsWith('.pdf')) {
      setError(t('ie.err_pdf_type'))
      return
    }
    if (picked.size > maxMb * 1024 * 1024) {
      setError(t('ie.err_pdf_too_big', { mb: maxMb }))
      return
    }
    setFile(picked)
  }

  const go = (key: 'ok' | 'err', text: string) => {
    const sep = tabUrl.includes('?') ? '&' : '?'
    router.push(`${tabUrl}${sep}${key}=${encodeURIComponent(text)}`)
    router.refresh()
  }

  const upload = () => {
    if (!file) return
    const body = new FormData()
    body.set('file', file)
    body.set('locale', locale)
    if (notify) body.set('notifyBuyers', 'on')
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setPct(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      const res = (xhr.response ?? {}) as { ok?: string; err?: string }
      if (res.ok) return go('ok', res.ok)
      setPct(null)
      if (res.err === 'origin') return setError(t('ie.err_pdf_origin'))
      if (res.err && res.err !== 'form') return setError(res.err)
      setError(t('ie.err_pdf_network'))
    }
    xhr.onerror = () => {
      setPct(null)
      setError(t('ie.err_pdf_network'))
    }
    setPct(0)
    xhr.send(body)
  }

  return (
    <div className="ie-drop-wrap" data-ie-ignore="">
      <div className="a-row">
        <label className="a-field">
          <span>{t('ie.pdf_language')}</span>
          <select
            className="a-select"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            {LANGS.map((one) => (
              <option key={one.key} value={one.key}>
                {one.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className={`ie-drop${over ? ' is-over' : ''}${file ? ' has-file' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          choose(event.dataTransfer.files[0])
        }}
        data-testid="ie-drop"
      >
        <b>{file ? file.name : t('ie.pdf_drop')}</b>
        <small>
          {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ` : ''}
          {t('ie.pdf_limit', { mb: maxMb })}
        </small>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => choose(event.target.files?.[0])}
      />
      <label className="a-check">
        <input
          type="checkbox"
          checked={notify}
          onChange={(event) => setNotify(event.target.checked)}
        />
        <span>{t('ie.pdf_notify')}</span>
      </label>
      {pct !== null ? (
        <div
          className="ie-progress"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${pct}%` }} />
          <small>{t('ie.pdf_uploading', { pct })}</small>
        </div>
      ) : null}
      {error ? (
        <p className="a-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="a-actions">
        <button
          type="button"
          className="a-btn accent"
          disabled={!file || pct !== null}
          onClick={upload}
        >
          {t('ie.pdf_upload')}
        </button>
      </div>
    </div>
  )
}
