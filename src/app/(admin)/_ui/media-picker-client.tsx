'use client'

import { useEffect, useRef, useState } from 'react'

import { useAdminT } from './i18n-provider'
import { MEDIA_API, type UploadedItem } from './media-upload-client'
import { MediaUploader } from './media-uploader'

/**
 * <MediaPicker> — the one image control used by every image field in Studio.
 *
 * Posts its value as a hidden input named `name` (a media id, or '' for no
 * image), exactly like the old radio grid/select did, so it drops into any
 * server-action form. Opens a dialog with: search by name, recent uploads
 * first, and an inline bulk uploader whose uploads appear at once.
 *
 * The itinerary editor (separate branch) can adopt it as-is.
 */

export interface PickerInitial {
  id: string
  name: string
  url: string
}

export function MediaPickerClient({
  name,
  label,
  hint,
  initial,
  maxBytes,
  required = false,
  multiple = false,
  initialList = [],
}: {
  name: string
  label: string
  hint?: string
  initial: PickerInitial | null
  /** A value outside the list (archived/old) keeps round-tripping. */
  maxBytes: number
  required?: boolean
  /** Gallery mode: several images, ordered; posts one hidden input each. */
  multiple?: boolean
  initialList?: PickerInitial[]
}) {
  const [list, setList] = useState<PickerInitial[]>(initialList)
  const { t } = useAdminT()
  const [value, setValue] = useState<PickerInitial | null>(initial)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<UploadedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const hidden = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      fetch(`${MEDIA_API}?limit=120&q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((body: { items: UploadedItem[] }) => {
          setItems(body.items)
          setFailed(false)
        })
        .catch((error: unknown) => {
          if ((error as Error).name !== 'AbortError') setFailed(true)
        })
        .finally(() => setLoading(false))
    }, 220)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [open, q])

  function toggle(next: PickerInitial) {
    setList((cur) =>
      cur.some((x) => x.id === next.id) ? cur.filter((x) => x.id !== next.id) : [...cur, next],
    )
    window.setTimeout(
      () => hidden.current?.dispatchEvent(new Event('change', { bubbles: true })),
      0,
    )
  }
  function move(index: number, by: number) {
    setList((cur) => {
      const copy = [...cur]
      const [it] = copy.splice(index, 1)
      if (it) copy.splice(Math.max(0, Math.min(copy.length, index + by)), 0, it)
      return copy
    })
  }
  function choose(next: PickerInitial | null) {
    if (multiple) {
      if (next) toggle(next)
      return
    }
    setValue(next)
    // Tell the unsaved-changes guard the form changed.
    window.setTimeout(
      () => hidden.current?.dispatchEvent(new Event('change', { bubbles: true })),
      0,
    )
    close()
  }
  function show() {
    setOpen(true)
    dialog.current?.showModal()
  }
  function close() {
    setOpen(false)
    dialog.current?.close()
  }

  return (
    <fieldset className="a-fieldset mp">
      <legend>
        {label}
        {required ? ' *' : ''}
      </legend>
      {hint ? <span className="a-hint">{hint}</span> : null}
      {multiple ? (
        <>
          <input ref={hidden} type="hidden" name={`${name}__present`} value="1" />
          {list.map((item) => (
            <input key={item.id} type="hidden" name={name} value={item.id} />
          ))}
          <ul className="mp-gallery">
            {list.map((item, index) => (
              <li key={item.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" />
                <span className="mp-g-name">{item.name}</span>
                <span className="mp-g-act">
                  <button
                    type="button"
                    className="a-btn ghost small"
                    aria-label={t('mc.move_up')}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="a-btn ghost small"
                    aria-label={t('mc.move_down')}
                    disabled={index === list.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button type="button" className="a-btn ghost small" onClick={() => toggle(item)}>
                    {t('mc.remove')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="a-btn small" onClick={show}>
            {t('mc.add_images')}
          </button>
        </>
      ) : (
        <input ref={hidden} type="hidden" name={name} value={value?.id ?? ''} />
      )}

      <div className="mp-current" hidden={multiple}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.url} alt="" className="mp-thumb" />
        ) : (
          <span className="mp-thumb mp-empty" aria-hidden="true" />
        )}
        <div className="mp-cur-text">
          <b>{value ? value.name : t('ui.media_none')}</b>
          <div className="mp-cur-actions">
            <button type="button" className="a-btn small" onClick={show}>
              {value ? t('ui.media_change') : t('ui.media_choose')}
            </button>
            {value ? (
              <button type="button" className="a-btn ghost small" onClick={() => choose(null)}>
                {t('mc.clear_image')}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <dialog ref={dialog} className="mp-dialog" onClose={() => setOpen(false)} aria-label={label}>
        <div className="mp-head">
          <b>{label}</b>
          <button type="button" className="a-btn ghost small" onClick={close}>
            {multiple ? t('mc.done_n', { n: list.length }) : t('mc.close')}
          </button>
        </div>
        <div className="mp-tools">
          <input
            className="a-input"
            type="search"
            placeholder={t('mc.search_ph')}
            aria-label={t('mc.search_ph')}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <button type="button" className="a-btn" onClick={() => setShowUpload((v) => !v)}>
            {showUpload ? t('mc.hide_upload') : t('mc.upload_new')}
          </button>
        </div>
        {showUpload ? (
          <MediaUploader
            compact
            maxBytes={maxBytes}
            onUploaded={(item) => setItems((list) => [item, ...list])}
            onAllDone={(done) => {
              if (multiple) done.forEach((item) => toggle(item))
              else if (done.length === 1 && done[0]) choose(done[0])
            }}
          />
        ) : null}
        <p className="a-hint mp-sub">{q ? t('mc.results') : t('mc.recent')}</p>
        {failed ? <p className="a-flash err">{t('mc.err_load')}</p> : null}
        <div className="mp-grid" aria-busy={loading}>
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`mp-item${(multiple ? list.some((x) => x.id === item.id) : item.id === value?.id) ? ' on' : ''}`}
              onClick={() => choose({ id: item.id, name: item.name, url: item.url })}
              title={item.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" loading="lazy" />
              <span>{item.name}</span>
            </button>
          ))}
          {!loading && items.length === 0 && !failed ? (
            <p className="a-hint">{q ? t('mc.no_results') : t('ui.media_library_empty')}</p>
          ) : null}
        </div>
      </dialog>
    </fieldset>
  )
}
