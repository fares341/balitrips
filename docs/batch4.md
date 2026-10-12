# الدفعة 4 — الدفع الحقيقي، الإشعارات، الجداول المخصصة، التقييمات

## بوابة الدفع: Stripe (H6)
- `src/lib/payments/stripe.ts` — صفحة دفع مستضافة (Checkout). بيانات البطاقة لا تمر بخوادمنا (PCI SAQ-A).
  Apple Pay / Google Pay / 3-D Secure جاهزة، والصفحة بالعربية حسب لغة العميل.
- بلا SDK: أربع نقاط نهاية عبر `fetch`، مع `Idempotency-Key`.
- التحقق من `Stripe-Signature` (HMAC-SHA256 + نافذة 5 دقائق ضد إعادة التشغيل، ويدعم تدوير السر).
- الدفع المؤجل (تحويل بنكي) لا يُعتبر مدفوعاً حتى `async_payment_succeeded`.
- التفعيل: `PAYMENT_PROVIDER=stripe` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.
- **لم يُختبر مقابل Stripe الحقيقي** (لا وصول للإنترنت من بيئة العمل). مختبر بـ 10 اختبارات وحدة مع
  محاكاة كاملة للـ API والتوقيع. أول خطوة عندك: مفاتيح `sk_test_` ودفع بطاقة الاختبار 4242 4242 4242 4242.
- Tap/Moyasar: أضف ملف adapter بنفس واجهة `PaymentProvider` وسجّله في `src/lib/payments/index.ts`.

## الإشعارات (H4)
- جدول `notifications` (للمستخدم وللفريق). النص يُترجم عند العرض بلغة القارئ.
- `notifyUser()` / `notifyStaff()` في `src/lib/notify`: صف داخل الموقع فوراً + طوابير بريد وواتساب.
- الأحداث: تسجيل دخول من جهاز جديد، دفع مستلم، تفعيل باقة، انتهاء باقة قريباً (مهمة يومية)،
  تغيّر حالة طلب مخصص، جدول مخصص جاهز. للفريق: طلب مدفوع، طلب مخصص جديد، رسالة تواصل،
  تنبيه أمني عالي الخطورة، فشل دفع.
- الواجهات: جرس في الرأس، `/account/notifications` (مع موافقة واتساب)، Studio → Inbox.
- واتساب: Meta Cloud API بقوالب معتمدة فقط، لمن وافق صراحةً وله رقم دولي. القوالب المطلوبة:
  `bali_new_device_login`, `bali_order_paid`, `bali_plan_activated`, `bali_plan_expiring`,
  `bali_custom_pdf_ready`, `bali_staff_custom_request`, `bali_staff_security_alert` — بنفس ترتيب
  المعاملات في `WHATSAPP_PARAM_ORDER` (`src/lib/notify/types.ts`).

## الجداول المخصصة (C9)
- حالات الوثيقة: new / under_review / in_progress / waiting_approval / completed / rejected (الهجرة تنقل القديمة).
- حقول جديدة: أطفال، خريطة VIP، ملاحظات داخلية. النموذج يجمع الأولين.
- Studio → Leads → الطلب: الحالة، الربط بحساب (لطلبات الضيوف)، رفع PDF (حتى 20MB، يُتحقق أنه PDF فعلاً)،
  نسخ متعددة، سحب نسخة.
- العميل: قسم "جداول الرحلات المخصصة" في `/account/schedules` → عارض آمن أو تحميل، بنفس العلامة المائية
  (`CT-xxxxxxxx`) والحظر وسياسة التحميل.

## متوسطة
- **التقييمات (M1):** `/account/reviews` — الأنشطة المدفوعة غير المقيّمة فقط (والفئات تُنسب لنشاطها).
  تُنشر بعد المراجعة في Studio → Reviews، وتحمل `order_id` ("موثّق").
- **رسائل التواصل (M2):** حالات new / read / replied / closed + إشعار للفريق.

## أخطاء قائمة أُصلحت في هذه الدفعة
- **رفع الصور فوق 1MB كان يفشل:** حد Server Actions الافتراضي 1MB، بينما مكتبة الوسائط تقبل 12MB.
  `experimental.serverActions.bodySizeLimit: '25mb'` في `next.config.ts`.
- **CSP كانت ستمنع الانتقال إلى صفحة الدفع:** `form-action 'self'` في Caddy — أُضيف `https://checkout.stripe.com`.
- **Blue/green:** بدون `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` مشترك، النماذج تفشل لمن فتح الصفحة قبل التبديل.

## التشغيل
```bash
pnpm db:migrate     # 0007_notifications_custom_docs
pnpm worker         # طوابير جديدة: whatsapp.send, notify.sweep (يومياً 09:07 بتوقيت بالي)
```
