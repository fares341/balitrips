/**
 * علامة مائية ديناميكية تُختم على ملف PDF عند كل فتح أو تحميل.
 *
 * الملف الأصلي يُولَّد مرة واحدة لكل إصدار ولغة (Gotenberg/Chromium، ثقيل).
 * الختم هنا خفيف (pdf-lib، بلا Chromium) ويحدث لكل طلب، فيحمل كل نسخة:
 *   - بريد المشتري، رقم الطلب، تاريخ ووقت التسليم
 *   - رمز تسليم فريد (`deliveryId`) مسجّل في `activity_log`
 *
 * النسخة المسرّبة تقود إلى الطلب والحساب والجهاز والوقت بالضبط.
 *
 * ⚠︎ الخط: خطوط PDF القياسية لا تدعم العربية، وpdf-lib لا يشكّل الحروف
 * العربية ولا يطبق اتجاه النص — اسم عربي سيُطبع حروفاً مقطعة معكوسة. لذلك
 * العلامة تستخدم البريد ورقم الطلب (لاتينية دائماً تقريباً)، وأي حرف خارج
 * WinAnsi يُستبدل بـ `?`. هذا قرار مقصود وليس نقصاً.
 */

import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface WatermarkInfo {
  email: string
  orderNumber: string
  deliveryId: string
  at: Date
}

/** WinAnsi فقط: ما تستطيع Helvetica رسمه. */
export function toWinAnsi(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 63
      return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) ? ch : '?'
    })
    .join('')
}

export function watermarkLines(info: WatermarkInfo): { tile: string; footer: string } {
  const stamp = info.at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  const email = toWinAnsi(info.email)
  const order = toWinAnsi(info.orderNumber)
  return {
    tile: `${email} · #${order}`,
    footer: `Licensed to ${email} · Order #${order} · ${stamp} · Ref ${info.deliveryId.slice(0, 8)} · Personal use only — do not share`,
  }
}

export async function stampPdf(source: Uint8Array, info: WatermarkInfo): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, { updateMetadata: false })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const { tile, footer } = watermarkLines(info)

  const tileSize = 14
  const tileWidth = font.widthOfTextAtSize(tile, tileSize)

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()

    // شبكة مائلة تغطي الصفحة: قصّ زاوية واحدة لا يزيلها.
    const stepX = tileWidth + 90
    const stepY = 150
    for (let y = -height; y < height * 2; y += stepY) {
      for (let x = -width; x < width * 2; x += stepX) {
        page.drawText(tile, {
          x,
          y,
          size: tileSize,
          font,
          color: rgb(0.45, 0.45, 0.45),
          opacity: 0.12,
          rotate: degrees(30),
        })
      }
    }

    // سطر واضح أسفل كل صفحة.
    let footerSize = 7
    while (footerSize > 4 && font.widthOfTextAtSize(footer, footerSize) > width - 24)
      footerSize -= 0.5
    page.drawText(footer, {
      x: 12,
      y: 8,
      size: footerSize,
      font,
      color: rgb(0.3, 0.3, 0.3),
      opacity: 0.8,
    })
  }

  // البيانات الوصفية أيضاً — تنجو من لقطات شاشة لا، لكنها تنجو من إعادة الحفظ.
  doc.setKeywords([`order:${toWinAnsi(info.orderNumber)}`, `delivery:${info.deliveryId}`])
  doc.setProducer('Bali Trips')
  doc.setModificationDate(info.at)

  return doc.save()
}
