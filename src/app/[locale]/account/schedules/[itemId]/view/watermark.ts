/**
 * سطر العلامة المائية فوق العارض الآمن (الوثيقة 16.3/17): البريد، رقم الطلب،
 * والتاريخ — نفس ما يُختم داخل الملف، فلقطة الشاشة تقود للطلب كما يقود الملف.
 *
 * تاريخ ISO لا محلي: التاريخ العربي داخل سطر لاتيني يتبعثر بسبب اتجاه النص.
 */
export function viewerWatermark(email: string, orderNumber: string | null, at = new Date()) {
  const day = at.toISOString().slice(0, 10)
  return orderNumber === null ? `${email} · ${day}` : `${email} · #${orderNumber} · ${day}`
}
