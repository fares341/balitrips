'use client'

/**
 * Copy the public share link. The server may build a root-relative URL when
 * `NEXT_PUBLIC_SITE_URL` is unset, so it is resolved against the current
 * origin before copying.
 */

import { useState } from 'react'

import { Button } from '@/components/shared'
import { Icon } from '@/components/ui'

export function CopyLinkButton({
  href,
  label,
  copiedLabel,
}: {
  href: string
  label: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const absolute = new URL(href, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(absolute)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard denied (insecure context, permissions): the link is still
      // visible and selectable in the field beside this button.
      window.prompt(label, absolute)
    }
  }

  return (
    <Button type="button" variant="forest" size="sm" onClick={copy} aria-live="polite">
      <Icon name={copied ? 'check' : 'globe'} size={15} color="#fff" />{' '}
      {copied ? copiedLabel : label}
    </Button>
  )
}
