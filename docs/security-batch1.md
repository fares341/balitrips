# الدفعة 1 — الأمان ومنع المشاركة

## ما تغيّر
| البند | التنفيذ |
|---|---|
| C1 رابط PDF مباشر | `account/schedules/[itemId]/download` يعيد رابطاً موقّعاً قصير العمر (`presignedGet`، 120 ث). بلا تخزين في الإنتاج → 503 بدل رابط مكشوف. |
| C4 سجل النشاط | جدول `activity_log` + `src/lib/security/activity.ts`. يُسجَّل: login, logout, login_failed, login_blocked, new_device, device_evicted, device_limit_blocked, device_revoked, download_pdf, unauthorized_access, banned, unbanned. |
| C3 الحظر | `users.status/banned_until/ban_reason` + `banned_ips` + `banned_devices`. فحص عند تسجيل الدخول وفي `checkSecureAccess()`. الحظر يحذف الجلسات فوراً. |
| C2 الأجهزة | جدول `devices` + `sessions.device_id` + `entitlements.device_limit`. البصمة تُحسب في المتصفح وتُرسل في كوكي `bt_dfp` (مسار `/api/auth` فقط). |

## الواجهات
- العميل: `/account/devices` (أجهزتي — عرض وإزالة).
- الإدارة: `Protection → Bans & signals` و`Activity log`، وبطاقة Protection في صفحة كل عميل.
- صلاحيات جديدة: `security.read` (staff+admin) و`security.write` (admin فقط).

## التشغيل
```bash
pnpm install
pnpm db:migrate          # يطبّق drizzle/0004_security_devices_bans_activity.sql
pnpm test                # يشمل src/lib/security/*.test.ts
```
متغيرات البيئة الجديدة في `.env.example`: `DEFAULT_DEVICE_LIMIT`، `SECURITY_NEW_DEVICE_POLICY`، `TRUSTED_IP_HEADER`، `DOWNLOAD_URL_TTL_SECONDS`.

## قرارات تصميم
- **الفحص ليس في `proxy.ts`**: الملف ممنوع من قراءة الكوكيز حفاظاً على كاش Cloudflare. الحارس `checkSecureAccess()` يعمل داخل المسارات المحمية ويقرأ صف الجلسة من قاعدة البيانات (لا من كوكي الكاش الذي يعيش 5 دقائق).
- **الـ IP ليس جزءاً من البصمة**: هاتف السائح يغيّر شبكته باستمرار؛ إدخال الـ IP كان سيستهلك حد الأجهزة في يوم واحد. يُخزَّن بجانبها.
- **IP العميل** = آخر قيمة في `X-Forwarded-For` (ما كتبه Caddy)، لا الأولى التي يتحكم بها العميل.
- **لا FingerprintJS**: ترخيص النسخة الحالية يقيّد الاستخدام التجاري.
- المدير والموظفون مستثنون من حد الأجهزة (تُسجَّل أجهزتهم فقط).

## خارج هذه الدفعة
- الخريطة لم تُربط بعد بـ `checkSecureAccess()` — يتم مع C7 (أماكن VIP).
- الحظر التلقائي، وwatermark PDF، والعارض الآمن — الدفعة 2.
- "موافقة الإدارة على الجهاز الجديد" كسياسة رابعة — لم تُنفَّذ.
- تنظيف `activity_log` الدوري (مهمة worker) — الدفعة 2.
