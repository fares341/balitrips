'use client'

/**
 * Campaign link builder: a page address + source / medium / campaign →
 * the tagged link to paste into an ad or a post. Runs entirely in the
 * browser; nothing is saved.
 */

import { useId, useState } from 'react'

import { buildCampaignUrl } from '@/lib/analytics/utm'

export function CampaignBuilder({
  siteUrl,
  labels,
}: {
  siteUrl: string
  labels: {
    page: string
    source: string
    sourceHint: string
    medium: string
    mediumHint: string
    campaign: string
    campaignHint: string
    content: string
    result: string
    copy: string
    copied: string
    invalid: string
  }
}) {
  const id = useId()
  const [page, setPage] = useState(`${siteUrl}/ar`)
  const [source, setSource] = useState('instagram')
  const [medium, setMedium] = useState('social')
  const [campaign, setCampaign] = useState('')
  const [content, setContent] = useState('')
  const [copied, setCopied] = useState(false)
  const url = buildCampaignUrl(page, { source, medium, campaign, content })

  const field = (
    name: string,
    label: string,
    value: string,
    set: (v: string) => void,
    hint?: string,
    list?: string[],
  ) => (
    <div className="a-field">
      <label htmlFor={`${id}-${name}`}>{label}</label>
      <input
        id={`${id}-${name}`}
        className="a-input"
        dir="ltr"
        value={value}
        list={list ? `${id}-${name}-list` : undefined}
        onChange={(event) => {
          set(event.target.value)
          setCopied(false)
        }}
      />
      {list ? (
        <datalist id={`${id}-${name}-list`}>
          {list.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
      {hint ? <p className="a-hint">{hint}</p> : null}
    </div>
  )

  return (
    <div className="a-form">
      {field('page', labels.page, page, setPage)}
      <div className="a-row">
        {field('source', labels.source, source, setSource, labels.sourceHint, [
          'instagram',
          'facebook',
          'tiktok',
          'google',
          'snapchat',
          'whatsapp',
          'newsletter',
        ])}
        {field('medium', labels.medium, medium, setMedium, labels.mediumHint, [
          'social',
          'cpc',
          'paid_social',
          'email',
          'influencer',
          'referral',
        ])}
      </div>
      <div className="a-row">
        {field('campaign', labels.campaign, campaign, setCampaign, labels.campaignHint)}
        {field('content', labels.content, content, setContent)}
      </div>
      <div className="a-field">
        <label htmlFor={`${id}-result`}>{labels.result}</label>
        <div className="rp-copy">
          <input
            id={`${id}-result`}
            className="a-input"
            readOnly
            value={url ?? ''}
            aria-invalid={url === null}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            className="a-btn"
            disabled={url === null}
            onClick={() => {
              if (!url) return
              void navigator.clipboard?.writeText(url).then(() => setCopied(true))
            }}
          >
            {copied ? labels.copied : labels.copy}
          </button>
        </div>
        {url === null ? (
          <p className="a-hint" role="alert">
            {labels.invalid}
          </p>
        ) : null}
      </div>
    </div>
  )
}
