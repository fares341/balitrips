'use client'

import { useRef } from 'react'

/**
 * The reply textarea with a "saved replies" picker. Choosing one puts its
 * text into the box (adding to what is there), to be edited before sending.
 * Without JavaScript the box still works; only the picker needs it.
 */
export function ReplyBox({
  templates,
  labels,
}: {
  templates: readonly { id: string; title: string; body: string }[]
  labels: { message: string; savedReply: string; choose: string }
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  return (
    <>
      {templates.length > 0 ? (
        <div className="a-field">
          <label htmlFor="saved-reply">{labels.savedReply}</label>
          <select
            id="saved-reply"
            className="a-select"
            value=""
            onChange={(event) => {
              const template = templates.find((item) => item.id === event.target.value)
              const area = box.current
              if (template && area) {
                area.value =
                  area.value.trim() === '' ? template.body : `${area.value}\n\n${template.body}`
                area.focus()
              }
            }}
          >
            <option value="">{labels.choose}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="a-field">
        <label htmlFor="reply-body">{labels.message}</label>
        <textarea
          ref={box}
          id="reply-body"
          name="body"
          className="a-textarea"
          rows={6}
          required
          maxLength={10000}
        />
      </div>
    </>
  )
}
