# تشغيل المشروع في وضع الإنتاج + حسابات الاختبار

ملفان يشغّلان **نسخة الإنتاج الحقيقية** (`next build` + worker + Postgres + Gotenberg) بأمر واحد:

| النظام | الملف |
|---|---|
| Linux / macOS / WSL / سيرفر | `deploy/start-production.sh` |
| Windows (Docker Desktop) | `deploy\start-production.cmd` |

كلاهما يستخدم `docker-compose.production.yml`، ويبني الصور على نفس الجهاز.

## المتطلبات

- **Docker 24+** مع `docker compose`، ويجب أن يكون شغّالاً. على Windows: Docker Desktop بـ WSL2.
- **curl** لفحص الصحة. موجود في Windows 10 1803 وما بعده.
- **openssl** على Linux/macOS فقط، لتوليد الأسرار.
- ذاكرة **4 GB على الأقل** متاحة لـ Docker، لأن `next build` يستهلك 1.5–3 GB.

## أول تشغيل

```bash
# Linux / macOS
chmod +x deploy/start-production.sh
./deploy/start-production.sh --seed --test-accounts
```

```bat
:: Windows (من مجلد المشروع)
deploy\start-production.cmd seed test-accounts
```

ماذا يحدث:

1. **يُنشأ `.env.production`** من `.env.production.example` بأسرار عشوائية جديدة:
   - كلمة مرور Postgres؛
   - `BETTER_AUTH_SECRET`؛
   - مفتاح Server Actions؛
   - سر الـ webhook؛
   - مسار إدارة عشوائي `/studio-xxxxxxxx`.

   الإعداد الافتراضي محلي وآمن للتجربة:
   - `LIVE_MODE=false`؛
   - دفع **sandbox** (بلا بطاقات حقيقية)؛
   - `ALLOW_BOOKINGS=true`؛
   - البريد يُطبع في سجل الـ worker (`EMAIL_TRANSPORT=console`).
2. يشغّل Postgres وGotenberg، ثم ينتظر جاهزيتهما.
3. يبني صورة الـ worker، ثم يطبّق الهجرات `0000 → 0011`.
4. يحمّل المحتوى المبدئي (مناطق، تصنيفات، وسوم، أماكن). يحدث هذا مع `--seed`، أو تلقائياً إن كانت القاعدة فارغة.
5. يبني صورة التطبيق. يستغرق ذلك دقائق، لأن البناء يقرأ القاعدة للصفحات المولّدة مسبقاً.
6. يشغّل التطبيق والـ worker، ثم ينتظر `/api/health`.
7. مع `--test-accounts` ينشئ حساباً لكل دور، ويحفظ البيانات في **`test-accounts-YYYYMMDD-HHMM.txt`**:
   - الملف مقروء لك فقط؛
   - مستثنى من git ومن صورة Docker؛
   - **احذفه بعد الاختبار**.

في النهاية يطبع الروابط:

- الموقع: `http://localhost:3000`
- الإدارة: `http://localhost:3000/studio-xxxxxxxx`. المسار في `.env.production` ← `ADMIN_BASE_PATH`.

## الأوامر

| Linux / macOS | Windows | الوظيفة |
|---|---|---|
| `./deploy/start-production.sh` | `deploy\start-production.cmd` | بناء وتحديث وتشغيل. البيانات تبقى |
| `… --seed` | `… seed` | + المحتوى المبدئي |
| `… --test-accounts` | `… test-accounts` | + حسابات الاختبار. يمكن إعادته، فيعيد ضبطها بكلمة مرور جديدة |
| `… --https` | — | + Caddy على 80/443 بشهادة Let's Encrypt. يحتاج `SITE_DOMAIN` و`ACME_EMAIL` ودومين يشير للسيرفر |
| `… --logs` | `… logs` | متابعة سجلات التطبيق والـ worker |
| `… --stop` | `… stop` | إيقاف كل شيء. البيانات محفوظة في volume `pgdata` |
| `… --remove-test-accounts` | `… remove-test-accounts` | حذف حسابات الاختبار وباقات TEST |

## حسابات الاختبار

- **كلمة المرور واحدة لكل الحسابات**، وتُولَّد عشوائياً في كل تشغيل.
- لتحديدها بنفسك: `TEST_ACCOUNT_PASSWORD=... ` في `.env.production`.
- النطاق `test.balitrips.local`، ويمكن تغييره بـ `TEST_ACCOUNT_DOMAIN`.

| الدور | الدخول | ماذا تختبر به |
|---|---|---|
| **Admin** (2FA) | `admin@test.balitrips.local` | لوحة الإدارة كاملة، بما فيها الاسترداد والباقات والأدوار والحظر والتصدير |
| **Staff** (2FA) | `staff@test.balitrips.local` | لوحة الإدارة بدون الاسترداد والباقات والأدوار والحظر والتصدير |
| Customer | `customer@test.balitrips.local` | عميل مسجّل بلا باقة. الأماكن المدفوعة مقفلة، وأزرار الشراء ظاهرة |
| Map plan | `map@test.balitrips.local` | خريطة مدفوعة 30 يوماً بجهازين. جرّب جهازاً ثالثاً لاختبار حد الأجهزة |
| VIP plan | `vip@test.balitrips.local` | VIP + Hidden Gems، 3 أجهزة |
| PDF only | `basic@test.balitrips.local` | باقة بلا خريطة (PDF / رحلتي / المفضلة) |
| Family owner | `family@test.balitrips.local` | باقة عائلية لثلاثة، وفيها فرد مضاف |
| Family member | `family-member@test.balitrips.local` | الخريطة عبر باقة صاحب العائلة |
| Phone only | **`+628100000099`** | الدخول برقم الجوال بلا بريد، ونسيت كلمة المرور عبر واتساب |
| Suspended | `suspended@test.balitrips.local` | تظهر رسالة "الحساب معلّق لحين المراجعة" |

**2FA للمدير والموظف:**

- الملف فيه `secret` ورابط `otpauth://` لكل منهما. أضفهما إلى Google Authenticator أو 1Password، يدوياً أو بتحويل الرابط إلى QR.
- فيه أيضاً **رموز استرداد** تصلح للدخول مرة واحدة لكل رمز.

**الباقات `TEST · …`:**

- تُنشأ بحالة **draft**، فلا تظهر للعملاء في صفحة الباقات.
- `remove-test-accounts` يحذفها.
- الحسابات التي لها طلبات أو سجل تدقيق لا تُحذف حذفاً فعلياً، حفاظاً على السجل المالي. بدلاً من ذلك تُغلق وتُجهَّل بيانات الحساب، كما يفعل حذف العميل من Studio.

## الدفع التجريبي

- مع `PAYMENT_PROVIDER=sandbox` تظهر صفحة دفع تجريبية: نجاح، أو فشل، أو 3DS.
- يكتمل الطلب ويُمنح الوصول تماماً كما مع Stripe.

لتجربة Stripe test:

1. اضبط في `.env.production`:
   - `PAYMENT_PROVIDER=stripe`؛
   - `STRIPE_SECRET_KEY=sk_test_…`؛
   - `STRIPE_WEBHOOK_SECRET=whsec_…`.
2. أعد التشغيل.

> متغيرات `NEXT_PUBLIC_*` و`PAYMENT_PROVIDER` و`ALLOW_SANDBOX_PAYMENTS` و`ADMIN_BASE_PATH` تُثبَّت **وقت البناء**. أي تغيير فيها يحتاج إعادة تشغيل السكربت، وهو يعيد البناء.

## قبل الإطلاق الفعلي

1. **غيّر في `.env.production`:**
   - `LIVE_MODE=true`؛
   - `PAYMENT_PROVIDER=stripe` بمفاتيح live؛
   - `ALLOW_SANDBOX_PAYMENTS=` (فارغ)؛
   - `EMAIL_TRANSPORT=resend` مع `RESEND_API_KEY`؛
   - مفاتيح DO Spaces؛
   - مفاتيح WhatsApp Cloud API؛
   - `SITE_DOMAIN` و`NEXT_PUBLIC_SITE_URL` و`BETTER_AUTH_URL` بالدومين الحقيقي، و`ACME_EMAIL`.
2. **احذف حسابات الاختبار:** `--remove-test-accounts`.
3. **أنشئ حساب المدير الحقيقي:**
   - سجّل حساباً عادياً من الموقع؛
   - رقِّه بالأمر:
     `docker compose -f docker-compose.production.yml --env-file .env.production run --rm --no-deps worker node scripts/create-admin.mjs you@example.com`
   - فعّل 2FA عند أول دخول للإدارة.
4. **شغّل مع `--https`.**
5. **اعتمد قوالب واتساب في Meta.** يجب أن تطابق أسماء القوالب ومتغيراتها `src/lib/notify/types.ts` حرفياً.

   | القالب | الفئة | المتغيرات |
   |---|---|---|
   | `bali_order_updated` | Utility | رقم الطلب، الحالة |
   | `bali_custom_status` | Utility | الحالة |
   | `bali_custom_quote` | Utility | الاسم، المبلغ |
   | `bali_pdf_ready_whatsapp` | Utility | اسم الجدول، الرابط |
   | `bali_password_reset_whatsapp` | Utility | الرابط |
   | `bali_phone_otp` | **Authentication** | الرمز (6 أرقام) |

## أعطال شائعة

| العَرَض | الحل |
|---|---|
| `POSTGRES_PASSWORD is not set` | احذف `.env.production` الناقص ليُعاد إنشاؤه، أو أكمل القيمة |
| البناء يفشل في الاتصال بالقاعدة | **Linux:** البناء يستخدم `--network host`. **Windows:** يستخدم `host.docker.internal`، فتأكد أن Docker Desktop محدَّث وأن المنفذ `55432` غير مستخدم، أو غيّر `DB_HOST_PORT` |
| المنفذ 3000 مستخدم | `APP_PORT=3100` في `.env.production` |
| `The app did not become healthy` | `--logs`، وغالباً متغير ناقص في `.env.production`. الرسالة توضّح أيّها |
| أريد البدء من الصفر | `--stop` ثم `docker volume rm bali-prod_pgdata` (**يحذف كل البيانات**) |
