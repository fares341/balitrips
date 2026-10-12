import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { printableName, stampPdf, toWinAnsi, watermarkLines } from './watermark'

const info = {
  email: 'traveller@example.com',
  orderNumber: 'BT-2026-000123',
  deliveryId: '6f1c2d3e-0000-4000-8000-000000000001',
  at: new Date('2026-10-12T08:30:00Z'),
}

async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i += 1) doc.addPage([595, 842])
  return doc.save()
}

describe('watermark', () => {
  it('replaces characters Helvetica cannot draw instead of throwing', () => {
    expect(toWinAnsi('أحمد@example.com')).toBe('????@example.com')
    expect(toWinAnsi('café')).toBe('café')
  })

  it('puts email, order number, time and a delivery reference in the footer', () => {
    const { footer, tile } = watermarkLines(info)
    expect(tile).toContain('traveller@example.com')
    expect(footer).toContain('#BT-2026-000123')
    expect(footer).toContain('2026-10-12 08:30 UTC')
    expect(footer).toContain('Ref 6f1c2d3e')
  })

  it('adds the buyer name when Latin-1 can draw it, and falls back to the email otherwise', () => {
    const latin = watermarkLines({ ...info, name: 'José  Müller' })
    expect(latin.tile).toContain('José Müller')
    expect(latin.tile).toContain('traveller@example.com')
    expect(latin.footer).toContain('Licensed to José Müller <traveller@example.com>')
    expect(latin.footer).toContain('#BT-2026-000123')

    const arabic = watermarkLines({ ...info, name: 'سارة' })
    expect(arabic.tile).toBe('traveller@example.com · #BT-2026-000123')
    expect(arabic.footer).not.toContain('?')
    expect(printableName('  ')).toBeNull()
    expect(printableName(null)).toBeNull()
  })

  it('stamps every page and records the delivery in metadata', async () => {
    const stamped = await stampPdf(await blankPdf(3), info)
    const doc = await PDFDocument.load(stamped)
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getKeywords()).toContain(`delivery:${info.deliveryId}`)
    // A stamped page carries drawing operators; the blank source had none.
    expect(stamped.byteLength).toBeGreaterThan((await blankPdf(3)).byteLength + 2000)
  })

  it('works on an Arabic e-mail without throwing', async () => {
    await expect(
      stampPdf(await blankPdf(1), { ...info, email: 'سارة@مثال.com' }),
    ).resolves.toBeInstanceOf(Uint8Array)
  })
})
