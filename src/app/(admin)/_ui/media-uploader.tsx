'use client'

import { useCallback, useRef, useState } from 'react'

import { useAdminT } from './i18n-provider'
import { CLIENT_TYPES, shrinkImage, uploadOne, type UploadedItem } from './media-upload-client'

/**
 * Bulk uploader: pick or drop many images at once. Each file is shrunk in the
 * browser when it is large, uploaded one by one with its own progress bar,
 * and named from its file name (editable before sending and renamable later).
 * Used by the media library and inline inside every <MediaPicker>.
 */

type Status = 'queued' | 'resizing' | 'uploading' | 'done' | 'error'

interface Row {
  key: string
  file: File
  name: string
  status: Status
  progress: number
  error?: string
  item?: UploadedItem
}

function baseName(fileName: string): string {
  return (
    fileName
      .replace(/\.[A-Za-z0-9]{1,5}$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'image'
  )
}

export function MediaUploader({
  maxBytes,
  onUploaded,
  onAllDone,
  compact = false,
}: {
  maxBytes: number
  onUploaded?: (item: UploadedItem) => void
  onAllDone?: (items: UploadedItem[]) => void
  compact?: boolean
}) {
  const { t } = useAdminT()
  const [rows, setRows] = useState<Row[]>([])
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const patch = (key: string, change: Partial<Row>) =>
    setRows((list) => list.map((row) => (row.key === key ? { ...row, ...change } : row)))

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const next: Row[] = []
      for (const file of Array.from(files)) {
        const key = `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`
        const typeOk = (CLIENT_TYPES as readonly string[]).includes(file.type)
        next.push({
          key,
          file,
          name: baseName(file.name),
          status: typeOk ? 'queued' : 'error',
          progress: 0,
          error: typeOk ? undefined : t('mc.err_type', { name: file.name }),
        })
      }
      setRows((list) => [...list, ...next])
    },
    [t],
  )

  async function start() {
    setBusy(true)
    const done: UploadedItem[] = []
    for (const row of rows) {
      if (row.status !== 'queued') continue
      try {
        patch(row.key, { status: 'resizing' })
        const file = await shrinkImage(row.file)
        if (file.size > maxBytes) {
          throw new Error(
            t('mc.err_too_big', {
              name: row.file.name,
              size: (file.size / 1048576).toFixed(1),
              max: (maxBytes / 1048576).toFixed(0),
            }),
          )
        }
        patch(row.key, { status: 'uploading', progress: 0 })
        const item = await uploadOne(file, row.name, (p) => patch(row.key, { progress: p }))
        patch(row.key, { status: 'done', progress: 1, item })
        done.push(item)
        onUploaded?.(item)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        patch(row.key, {
          status: 'error',
          error: message === 'network' ? t('mc.err_network') : message,
        })
      }
    }
    setBusy(false)
    onAllDone?.(done)
  }

  const queued = rows.filter((row) => row.status === 'queued').length
  const finished = rows.filter((row) => row.status === 'done').length

  return (
    <div className="mu">
      <div
        className={`mu-drop${over ? ' over' : ''}${compact ? ' compact' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files)
        }}
      >
        <p className="mu-title">{t('mc.drop_title')}</p>
        <p className="a-hint">{t('mc.drop_hint', { max: (maxBytes / 1048576).toFixed(0) })}</p>
        <button type="button" className="a-btn" onClick={() => input.current?.click()}>
          {t('mc.choose_files')}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={CLIENT_TYPES.join(',')}
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      {rows.length > 0 ? (
        <>
          <ul className="mu-list">
            {rows.map((row) => (
              <li key={row.key} className={`mu-row ${row.status}`}>
                <input
                  className="a-input"
                  value={row.name}
                  aria-label={t('mc.name')}
                  disabled={row.status !== 'queued'}
                  onChange={(event) => patch(row.key, { name: event.target.value })}
                />
                <span className="mu-meta" dir="ltr">
                  {(row.file.size / 1048576).toFixed(1)} MB
                </span>
                <span className="mu-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(row.progress * 100)}%` }} />
                </span>
                <span className="mu-state" role="status">
                  {row.status === 'error' ? row.error : t(`mc.state_${row.status}`)}
                </span>
                {row.status === 'queued' ? (
                  <button
                    type="button"
                    className="a-btn ghost small"
                    onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                  >
                    {t('mc.remove')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mu-actions">
            <button
              type="button"
              className="a-btn primary"
              disabled={busy || queued === 0}
              onClick={() => void start()}
            >
              {busy
                ? t('mc.uploading_n', { done: finished, total: rows.length })
                : t('mc.upload_n', { n: queued })}
            </button>
            {!busy && queued === 0 ? (
              <button type="button" className="a-btn ghost" onClick={() => setRows([])}>
                {t('mc.clear')}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
