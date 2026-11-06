import qrcode from 'qrcode-generator'

/**
 * A QR code as an inline SVG string (dark modules in the brand forest), for
 * the «فعاليات جدولي» link on the buyer page and inside the itinerary PDF.
 * `text` is ours (an absolute site URL); the output carries no user input.
 */
export function qrSvg(text: string, color = '#26552e'): string {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr
    .createSvgTag({ cellSize: 4, margin: 2, scalable: true })
    .replace(/fill="black"/g, `fill="${color}"`)
    .replace(/<svg /, '<svg role="img" aria-hidden="true" ')
}
