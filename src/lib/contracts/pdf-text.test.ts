import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { extractPdfText } from './pdf-text'

describe('extractPdfText', () => {
  it('reads the text of a generated contract', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.addPage([595, 842])
    page.drawText('Net price per guest: 450,000 IDR', { x: 50, y: 760, size: 12, font })
    page.drawText('Cancellation: free up to 48 hours before', { x: 50, y: 740, size: 12, font })
    pdf.addPage([595, 842]).drawText('Term: 12 months, renews yearly', { x: 50, y: 760, font })
    const text = await extractPdfText(await pdf.save())
    expect(text).toContain('450,000 IDR')
    expect(text).toContain('free up to 48 hours')
    expect(text).toContain('12 months')
  }, 60_000)
})
