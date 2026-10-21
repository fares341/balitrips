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
| `… --stop` | `… stop` | إيقاف كل شيء. البيانات محفوظة في volume `pgdata` (والوسائط في `media_data`، والـ PDF في `private_data`) |
| `… --remove-test-accounts` | `… remove-test-accounts` | حذف حسابات الاختبار وباقات TEST |

## الصور

- **من أين تأتي الصور:** الـ seed بيحط صور مؤقتة مرسومة (SVG) بس. الصور الحقيقية بتتنزل من Wikimedia Commons ومعاها حقوق كل صورة، وبتعدّي على نفس معالجة رفع الصور في لوحة الإدارة.
- **النزول التلقائي:** السكربت بينزّلها لوحده لو المكتبة مفيهاش ولا صورة حقيقية. ده بيحصل في أول تشغيل، وفي أول تحديث على السيرفر التجريبي.
- **إعادة التنزيل يدوياً:**
  - Linux: `./deploy/start-production.sh --photos`
  - Windows: `deploy\start-production.cmd photos`
- **لو التنزيل فشل** (مثلاً مفيش إنترنت)، الموقع بيكمل بالصور المؤقتة.
- **صورك الخاصة:** بترفعها من لوحة الإدارة ← مكتبة الوسائط.

## الوسائط المرفوعة بدون Spaces

- إن لم تُضبط مفاتيح DO Spaces، تُحفظ الصور التي تُرفع من مكتبة الوسائط (ودرجاتها AVIF/WebP) وفيديوهات الأماكن في `public/media` داخل الحاوية، وهو الـ volume **`media_data`** المشترك بين `app` و`worker`. تبقى بعد إعادة البناء والتشغيل.
- **التطبيق نفسه يخدمها** على `/media/…` (`src/app/media/[...path]/route.ts`): خادم Next المستقل لا يخدم من `public/` إلا ما كان موجوداً وقت البناء. فقط أنواع الصور والفيديو التي يكتبها الرفع (avif, webp, jpg, png, mp4, webm)، مع تخزين مؤقت طويل.
- عند ضبط Spaces لا يُستخدم هذا المسار: الروابط تشير إلى الـ CDN (`NEXT_PUBLIC_CDN_URL`).
- **ملفات PDF خاصة:**
  - تشمل الجداول المرفوعة والمولّدة، والخطط المخصصة، والإيصالات.
  - تُحفظ في volume منفصل اسمه **`private_data`** (`/app/storage/private`، متغير `PRIVATE_STORAGE_DIR`).
  - ليس لها أي رابط عام: الخادم وحده يقرؤها، ويسلّمها مختومة بالعلامة المائية بعد فحص الصلاحية، تماماً كمسار Spaces.
  - بهذا تعمل كل ميزات الـ PDF في الاختبار المحلي بلا Spaces. عند ضبط Spaces يُتجاهل هذا المجلد.
- **النسخ الاحتياطي:** انسخ الـ volumes `bali-prod_media_data` و`bali-prod_private_data` مع قاعدة البيانات، وإلا ضاعت الصور والـ PDFs.

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

## لوحة الإدارة

- **الدخول:** المدير أو الموظف يسجّل الدخول من نافذة الدخول العادية في الموقع، فينتقل تلقائياً إلى لوحة الإدارة (`/studio-xxxxxxxx`).
  - أول مرة تطلب اللوحة إعداد التحقق بخطوتين، باستثناء حسابات الاختبار: سرّها جاهز في ملف `test-accounts-*.txt`.
- **اللغة:** تبدأ اللوحة بالعربية (من اليمين لليسار).
  - زر **English / العربية** أسفل القائمة الجانبية يبدّل اللغة، ويُحفظ الاختيار في المتصفح.
  - المحتوى نفسه (الأماكن، الجداول، المقالات) يبقى بثلاث لغات.
- **الجوال:** على الشاشات الصغيرة تتحول القائمة الجانبية إلى زر قائمة أعلى الصفحة.

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
   | `bali_plan_expired` | Utility | اسم الباقة |
   | `bali_activity_available` | Utility | اسم النشاط، رابط النشاط («أبلغني عند التوفر») |

   قالب `bali_phone_otp` من فئة Authentication يحتاج **زر "نسخ الرمز"**؛ الكود يرسل الرمز للنص وللزر معاً.

   قالب `bali_pdf_ready_whatsapp` يُستعمل الآن للجداول الجاهزة والمخصصة معاً. اكتب نصه عاماً، مثل: "جدول رحلتك {{1}} جاهز: {{2}}".

6. **Stripe — بطاقات + Apple Pay + Google Pay.** الكود لا يحدد `payment_method_types`،
   فصفحة Stripe Checkout تعرض ما هو مفعّل في لوحة Stripe. في الوضع الحي (live):
   - Dashboard ← Settings ← Payments ← **Payment methods**: فعّل Cards وApple Pay وGoogle Pay،
     وأطفئ أي طريقة أخرى (القرار: Stripe فقط، بطاقات + محافظ).
   - **لا يلزم توثيق النطاق لـ Apple Pay** لأن الدفع على صفحة Stripe المستضافة
     (checkout.stripe.com). يلزم فقط إن استُبدلت لاحقاً بـ Payment Element داخل موقعنا:
     Settings ← Payment method domains ← أضف النطاق.
   - Apple Pay يظهر فقط على Safari/أجهزة Apple بها بطاقة في Wallet، وGoogle Pay على Chrome بحساب به بطاقة.

## التحديث التلقائي من GitHub

كل push على `main` يوصل للسيرفر تلقائياً. السكربت `deploy/update.sh` بيعمل الآتي:

1. يسحب آخر commit.
2. يبني الصور.
3. يطبّق الـ migrations.
4. يعيد تشغيل الموقع ويتأكد إنه شغال.

لو أي خطوة فشلت، بيرجع للنسخة اللي قبلها تلقائياً. البيانات والملفات و`.env.production` ما بتتلمسش.

### أول مرة على السيرفر (مرة واحدة)

```bash
# 1) مفتاح قراءة للريبو (الريبو private)
ssh-keygen -t ed25519 -f ~/.ssh/balitrips_deploy -N ""
cat ~/.ssh/balitrips_deploy.pub
#    انسخه في GitHub: الريبو ← Settings ← Deploy keys ← Add (Read-only)
cat >> ~/.ssh/config <<'CFG'
Host github-balitrips
  HostName github.com
  User git
  IdentityFile ~/.ssh/balitrips_deploy
  IdentitiesOnly yes
CFG

# 2) نسخ المشروع وتشغيله أول مرة
sudo mkdir -p /opt/balitrips && sudo chown "$USER" /opt/balitrips
git clone git@github-balitrips:fares341/balitrips.git /opt/balitrips
cd /opt/balitrips
./deploy/start-production.sh --seed --test-accounts

# 3) تشغيل التحديث التلقائي (يفحص GitHub كل دقيقتين)
sudo ./deploy/install-autodeploy.sh
```

خلاص. بعد كده أي تعديل تعمله push على `main` هيظهر على السيرفر خلال دقيقتين، بالإضافة لوقت البناء (5 إلى 10 دقائق).

### أوامر مفيدة

| الأمر | الوظيفة |
|---|---|
| `./deploy/update.sh` | تحديث يدوي فوراً، ولو مفيش جديد مش بيعمل حاجة |
| `./deploy/update.sh --force` | إعادة بناء وتشغيل حتى من غير تغيير |
| `journalctl -u balitrips-update -f` | متابعة التحديثات التلقائية |
| `ls deploy/logs/` | سجل كل تحديث بالتاريخ |
| `sudo ./deploy/install-autodeploy.sh --remove` | إيقاف التحديث التلقائي |

**HTTPS:** لو شغّال بـ `--https`، اكتب في `.env.production` السطر `DEPLOY_FLAGS=--https`، فيستخدمه التحديث التلقائي كل مرة.

**بديل بـ GitHub Actions (اختياري):** الملف `.github/workflows/deploy.yml` بيحدّث السيرفر بعد ما الـ CI ينجح. محتاج تضيف secrets في GitHub:
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH` (اختياري)

من غير الـ secrets دي بيتخطى نفسه. استخدم طريقة واحدة بس، يا التايمر يا Actions.

**ملاحظات:**
- **الذاكرة:** البناء على السيرفر محتاج 4GB رام أو swap. لو السيرفر 2GB:
  ```bash
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- **التوقف أثناء التحديث:** الموقع بيقف ثواني بس، وقت تبديل الحاوية.
- **الـ migrations ما بتترجعش:** الرجوع لنسخة قديمة بيرجّع الكود بس. اكتب الـ migrations بحيث تضيف من غير ما تحذف، والنسخة القديمة تشتغل عليها.
- **ما تعدّلش ملفات المشروع على السيرفر نفسه:** التحديث بيمسحها. عدّل في الريبو، و`.env.production` بس هو اللي بيتعدّل على السيرفر.

## أعطال شائعة

| العَرَض | الحل |
|---|---|
| `POSTGRES_PASSWORD is not set` | احذف `.env.production` الناقص ليُعاد إنشاؤه، أو أكمل القيمة |
| البناء يفشل في الاتصال بالقاعدة | **Linux:** البناء يستخدم `--network host`. **Windows:** يستخدم `host.docker.internal`، فتأكد أن Docker Desktop محدَّث وأن المنفذ `55432` غير مستخدم، أو غيّر `DB_HOST_PORT` |
| المنفذ 3000 مستخدم | `APP_PORT=3100` في `.env.production` |
| `The app did not become healthy` | `--logs`، وغالباً متغير ناقص في `.env.production`. الرسالة توضّح أيّها |
| أريد البدء من الصفر | `--stop` ثم `docker volume rm bali-prod_pgdata bali-prod_media_data` (**يحذف كل البيانات والصور المرفوعة**) |
| صورة مرفوعة تظهر 404 | بلا Spaces: تأكد أن الملف موجود في volume `media_data` (`docker compose … exec app ls public/media`) وأن صورة Docker للتطبيق أُعيد بناؤها بعد هذا التحديث |
| قيمة في `.env.production` بين علامتي تنصيص | تُزال علامتا التنصيص المحيطتان (`"…"` أو `'…'`) مرة واحدة، كما يفعل docker compose. علامة `!` في القيم تبقى كما هي في سكربت Windows |
