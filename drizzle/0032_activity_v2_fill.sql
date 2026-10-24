-- Activity page v2: fill the empty sections of every published activity
-- (the seven merged in 0028 and the single ones) so their live pages are as
-- complete as the v2 design.
--
-- Data only and additive. Every field is written ONLY when it is empty
-- (NULL, '' or an empty list), so nothing the owner has edited is touched,
-- and running this twice changes nothing. Facts come from the database first
-- (the merged source activities). Where nothing exists, generic text is used
-- that makes no claim about prices, durations, capacities or inclusions.
-- Prices and packages are never touched. Rows marked needs_review.

CREATE OR REPLACE FUNCTION pg_temp.bt_loc_empty(v jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT v IS NULL OR jsonb_typeof(v) <> 'object' OR (
    coalesce(btrim(v->>'ar'), '') = '' AND coalesce(btrim(v->>'en'), '') = '' AND coalesce(btrim(v->>'id'), '') = '')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION pg_temp.bt_list_empty(v jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT v IS NULL OR jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) = 0
$$;
--> statement-breakpoint

-- 1) From the merged source activities (first source with data, in the
--    order their packages are listed): description, duration, area, meeting
--    point, map link and time note, suitable-for, cover photo.
CREATE OR REPLACE FUNCTION pg_temp.bt_from_sources(aid uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  s record;
BEGIN
  FOR s IN
    SELECT a.* FROM "activities" a
    LEFT JOIN LATERAL (
      SELECT min(t."sort_order") AS pos FROM "activity_tiers" t
      WHERE t."activity_id" = aid AND t."deleted_at" IS NULL
        AND (t."key" = a."slug" OR t."key" LIKE a."slug" || '-%')
    ) p ON true
    WHERE a."merged_into_id" = aid AND a."deleted_at" IS NULL
    ORDER BY p.pos NULLS LAST, a."created_at"
  LOOP
    UPDATE "activities" x SET
      "description" = CASE WHEN pg_temp.bt_loc_empty(x."description") AND NOT pg_temp.bt_loc_empty(s."description") THEN s."description" ELSE x."description" END,
      "duration" = CASE WHEN pg_temp.bt_loc_empty(x."duration") AND NOT pg_temp.bt_loc_empty(s."duration") THEN s."duration" ELSE x."duration" END,
      "area" = CASE WHEN pg_temp.bt_loc_empty(x."area") AND NOT pg_temp.bt_loc_empty(s."area") THEN s."area" ELSE x."area" END,
      "meeting_point" = CASE WHEN pg_temp.bt_loc_empty(x."meeting_point") AND NOT pg_temp.bt_loc_empty(s."meeting_point") THEN s."meeting_point" ELSE x."meeting_point" END,
      "meeting_time_note" = CASE WHEN pg_temp.bt_loc_empty(x."meeting_time_note") AND NOT pg_temp.bt_loc_empty(s."meeting_time_note") THEN s."meeting_time_note" ELSE x."meeting_time_note" END,
      "meeting_map_url" = CASE WHEN coalesce(btrim(x."meeting_map_url"), '') = '' AND coalesce(btrim(s."meeting_map_url"), '') <> '' THEN s."meeting_map_url" ELSE x."meeting_map_url" END,
      "meeting_lat" = CASE WHEN x."meeting_lat" IS NULL AND x."meeting_lng" IS NULL THEN s."meeting_lat" ELSE x."meeting_lat" END,
      "meeting_lng" = CASE WHEN x."meeting_lat" IS NULL AND x."meeting_lng" IS NULL THEN s."meeting_lng" ELSE x."meeting_lng" END,
      "suitable_for" = CASE WHEN pg_temp.bt_list_empty(x."suitable_for") AND NOT pg_temp.bt_list_empty(s."suitable_for") THEN s."suitable_for" ELSE x."suitable_for" END,
      "hero_image_id" = coalesce(x."hero_image_id", s."hero_image_id")
    WHERE x."id" = aid;
  END LOOP;

  -- No cover yet: the first gallery photo.
  UPDATE "activities" x SET "hero_image_id" = (
    SELECT i."media_id" FROM "activity_images" i JOIN "media" m ON m."id" = i."media_id"
    WHERE i."activity_id" = aid AND m."deleted_at" IS NULL
    ORDER BY i."sort_order" LIMIT 1)
  WHERE x."id" = aid AND x."hero_image_id" IS NULL;

  -- Gallery: no photo twice. The cover is shown first by the page, so a
  -- gallery row for it goes; so does a second upload of the same file
  -- (same size and dimensions). Media rows themselves are kept.
  DELETE FROM "activity_images" i
  USING "activities" x
  WHERE i."activity_id" = aid AND x."id" = aid AND i."media_id" = x."hero_image_id";
  DELETE FROM "activity_images" i
  USING "media" m
  WHERE i."activity_id" = aid AND m."id" = i."media_id"
    AND EXISTS (
      SELECT 1 FROM "activity_images" j JOIN "media" n ON n."id" = j."media_id"
      WHERE j."activity_id" = aid AND j."media_id" <> i."media_id"
        AND n."bytes" = m."bytes" AND n."width" = m."width" AND n."height" = m."height"
        AND (j."sort_order", j."media_id") < (i."sort_order", i."media_id"));
  DELETE FROM "activity_images" i
  USING "media" m, "activities" x, "media" h
  WHERE i."activity_id" = aid AND m."id" = i."media_id"
    AND x."id" = aid AND h."id" = x."hero_image_id"
    AND h."bytes" = m."bytes" AND h."width" = m."width" AND h."height" = m."height";
END $$;
--> statement-breakpoint

-- 2) Generic, non-committal text where the activity still has none.
CREATE OR REPLACE FUNCTION pg_temp.bt_fill_text(aid uuid, bring jsonb) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "activities" x SET
    "highlights" = CASE WHEN pg_temp.bt_list_empty(x."highlights") THEN '[
      {"ar":"عدة باقات تختار منها ما يناسبك","en":"Several packages to choose from","id":"Beberapa paket untuk dipilih"},
      {"ar":"ما تشمله كل باقة مذكور في بطاقتها","en":"Each package card lists what it includes","id":"Setiap kartu paket mencantumkan isinya"},
      {"ar":"لا يُخصم المبلغ إلا بعد تأكيد مقدّم الخدمة","en":"You are charged only once the provider confirms","id":"Pembayaran baru ditagih setelah penyedia mengonfirmasi"}
    ]'::jsonb ELSE x."highlights" END,
    "what_to_bring" = CASE WHEN pg_temp.bt_list_empty(x."what_to_bring") THEN bring ELSE x."what_to_bring" END,
    "age_conditions" = CASE WHEN pg_temp.bt_list_empty(x."age_conditions") THEN '[
      {"ar":"الأطفال برفقة شخص بالغ","en":"Children must be with an adult","id":"Anak-anak harus didampingi orang dewasa"},
      {"ar":"حدود العمر والحالة الصحية يحددها مقدّم الخدمة وقد تختلف بين الباقات؛ اسألنا قبل الحجز","en":"Age and health limits are set by the provider and may differ by package; ask us before booking","id":"Batas usia dan kesehatan ditentukan penyedia dan bisa berbeda per paket; tanyakan kepada kami sebelum memesan"},
      {"ar":"يرجى إبلاغنا بأي حالة صحية خاصة أو حمل","en":"Please tell us about any health condition or pregnancy","id":"Mohon beri tahu kami tentang kondisi kesehatan khusus atau kehamilan"}
    ]'::jsonb ELSE x."age_conditions" END,
    "important_notes" = CASE WHEN pg_temp.bt_list_empty(x."important_notes") THEN '[
      {"ar":"يرجى الحضور إلى نقطة الالتقاء في الموعد","en":"Please be at the meeting point on time","id":"Mohon tiba di titik temu tepat waktu"},
      {"ar":"قد يتغيّر الموعد بسبب الطقس أو بقرار من مقدّم الخدمة، وسنبلغك بذلك","en":"Times may change because of the weather or at the provider''s decision; we will let you know","id":"Jadwal dapat berubah karena cuaca atau keputusan penyedia; kami akan memberi tahu Anda"}
    ]'::jsonb ELSE x."important_notes" END,
    "faq" = CASE WHEN pg_temp.bt_list_empty(x."faq") THEN '[
      {"q":{"ar":"ماذا أرتدي وماذا أحضر؟","en":"What should I wear and bring?","id":"Apa yang sebaiknya saya pakai dan bawa?"},
       "a":{"ar":"ملابس مريحة تناسب النشاط، وما في قائمة «ماذا تحضر معك» في هذه الصفحة.","en":"Comfortable clothes suited to the activity, plus the items under «What to bring» on this page.","id":"Pakaian nyaman yang sesuai dengan aktivitas, ditambah barang di bagian «Apa yang perlu dibawa» di halaman ini."}},
      {"q":{"ar":"هل التوصيل من الفندق مشمول؟","en":"Is hotel pickup included?","id":"Apakah penjemputan dari hotel termasuk?"},
       "a":{"ar":"يختلف حسب الباقة، وبطاقة كل باقة تذكر ما تشمله. إن لم يكن مذكورًا فاسألنا عنه قبل الحجز.","en":"It depends on the package; each package card lists what it includes. If it is not listed, ask us before booking.","id":"Tergantung paketnya; setiap kartu paket mencantumkan isinya. Jika tidak tercantum, tanyakan kepada kami sebelum memesan."}},
      {"q":{"ar":"متى يُخصم المبلغ؟","en":"When am I charged?","id":"Kapan pembayaran ditagih?"},
       "a":{"ar":"عند الحجز يُحجز المبلغ فقط على بطاقتك، ولا يُخصم إلا بعد أن يؤكد مقدّم الخدمة حجزك. إن لم يؤكده يُلغى الحجز ويُفك المبلغ.","en":"When you book, the amount is only held on your card; it is charged once the provider confirms your booking. If they do not confirm, the booking is cancelled and the hold released.","id":"Saat memesan, jumlahnya hanya ditahan di kartu Anda dan baru ditagih setelah penyedia mengonfirmasi pemesanan. Jika tidak dikonfirmasi, pemesanan dibatalkan dan dana yang ditahan dilepas."}},
      {"q":{"ar":"هل يمكنني الإلغاء واسترداد المبلغ؟","en":"Can I cancel for a refund?","id":"Bisakah saya membatalkan dan mendapat pengembalian dana?"},
       "a":{"ar":"جميع الحجوزات غير قابلة للاسترداد، إلا إذا تعذّر على مقدّم الخدمة تنفيذها لظرف قاهر؛ عندها يُلغى الحجز ويُرد المبلغ كاملًا.","en":"All bookings are non-refundable, except when the provider cannot run the service because of force majeure; the booking is then cancelled and fully refunded.","id":"Semua pemesanan tidak dapat dikembalikan dananya, kecuali jika penyedia tidak dapat menjalankan layanan karena keadaan kahar; pemesanan kemudian dibatalkan dan dana dikembalikan penuh."}},
      {"q":{"ar":"هل يمكن الحجز لنفس اليوم؟","en":"Can I book for the same day?","id":"Bisakah saya memesan untuk hari yang sama?"},
       "a":{"ar":"حسب الإتاحة وتأكيد مقدّم الخدمة.","en":"Subject to availability and the provider''s confirmation.","id":"Tergantung ketersediaan dan konfirmasi penyedia."}}
    ]'::jsonb ELSE x."faq" END,
    "needs_review" = true,
    "updated_at" = now()
  WHERE x."id" = aid
    AND (pg_temp.bt_list_empty(x."highlights") OR pg_temp.bt_list_empty(x."what_to_bring")
      OR pg_temp.bt_list_empty(x."age_conditions") OR pg_temp.bt_list_empty(x."important_notes")
      OR pg_temp.bt_list_empty(x."faq"));
END $$;
--> statement-breakpoint

DO $$
DECLARE
  water jsonb := '[
    {"ar":"ملابس سباحة","en":"Swimwear","id":"Pakaian renang"},
    {"ar":"منشفة وملابس للتبديل","en":"Towel and a change of clothes","id":"Handuk dan pakaian ganti"},
    {"ar":"واقي شمس","en":"Sunscreen","id":"Tabir surya"},
    {"ar":"حافظة مقاومة للماء للهاتف","en":"Waterproof phone pouch","id":"Kantong ponsel tahan air"}
  ]';
  rafting jsonb := '[
    {"ar":"ملابس لا بأس أن تبتل","en":"Clothes that can get wet","id":"Pakaian yang boleh basah"},
    {"ar":"منشفة وملابس للتبديل","en":"Towel and a change of clothes","id":"Handuk dan pakaian ganti"},
    {"ar":"حذاء أو صندل مثبّت بالقدم","en":"Shoes or strapped sandals","id":"Sepatu atau sandal bertali"},
    {"ar":"واقي شمس","en":"Sunscreen","id":"Tabir surya"}
  ]';
  island jsonb := '[
    {"ar":"حذاء مريح للمشي","en":"Comfortable walking shoes","id":"Sepatu yang nyaman untuk berjalan"},
    {"ar":"قبعة وواقي شمس","en":"Hat and sunscreen","id":"Topi dan tabir surya"},
    {"ar":"ملابس سباحة ومنشفة إن رغبت بالسباحة","en":"Swimwear and a towel if you plan to swim","id":"Pakaian renang dan handuk jika ingin berenang"},
    {"ar":"ماء للشرب","en":"Drinking water","id":"Air minum"},
    {"ar":"نقود للمصاريف الشخصية","en":"Cash for personal expenses","id":"Uang tunai untuk keperluan pribadi"}
  ]';
  park jsonb := '[
    {"ar":"ملابس مريحة","en":"Comfortable clothes","id":"Pakaian yang nyaman"},
    {"ar":"حذاء مريح للمشي","en":"Comfortable walking shoes","id":"Sepatu yang nyaman untuk berjalan"},
    {"ar":"قبعة وواقي شمس","en":"Hat and sunscreen","id":"Topi dan tabir surya"},
    {"ar":"كاميرا أو هاتف للتصوير","en":"Camera or phone for photos","id":"Kamera atau ponsel untuk foto"}
  ]';
  shooting jsonb := '[
    {"ar":"ملابس مريحة","en":"Comfortable clothes","id":"Pakaian yang nyaman"},
    {"ar":"حذاء مغلق","en":"Closed-toe shoes","id":"Sepatu tertutup"},
    {"ar":"ماء للشرب","en":"Drinking water","id":"Air minum"}
  ]';
  air jsonb := '[
    {"ar":"ملابس مريحة","en":"Comfortable clothes","id":"Pakaian yang nyaman"},
    {"ar":"حذاء مغلق","en":"Closed-toe shoes","id":"Sepatu tertutup"},
    {"ar":"سترة خفيفة","en":"A light jacket","id":"Jaket tipis"},
    {"ar":"نظارة شمسية وواقي شمس","en":"Sunglasses and sunscreen","id":"Kacamata hitam dan tabir surya"},
    {"ar":"كاميرا أو هاتف للتصوير","en":"Camera or phone for photos","id":"Kamera atau ponsel untuk foto"}
  ]';
  land jsonb := '[
    {"ar":"ملابس مريحة","en":"Comfortable clothes","id":"Pakaian yang nyaman"},
    {"ar":"حذاء مريح للمشي","en":"Comfortable walking shoes","id":"Sepatu yang nyaman untuk berjalan"},
    {"ar":"قبعة وواقي شمس","en":"Hat and sunscreen","id":"Topi dan tabir surya"},
    {"ar":"ماء للشرب","en":"Drinking water","id":"Air minum"},
    {"ar":"نقود للمصاريف الشخصية","en":"Cash for personal expenses","id":"Uang tunai untuk keperluan pribadi"}
  ]';
  k text;
  rec record;
BEGIN
  -- Every published activity; the list of things to bring is chosen from
  -- the slug and English name.
  FOR rec IN
    SELECT a."id", a."slug", lower(a."slug" || ' ' || coalesce(a."name"->>'en', '')) AS words
    FROM "activities" a
    WHERE a."status" = 'published' AND a."deleted_at" IS NULL AND a."merged_into_id" IS NULL
  LOOP
    k := rec.words;
    PERFORM pg_temp.bt_from_sources(rec."id");
    PERFORM pg_temp.bt_fill_text(rec."id", CASE
      WHEN k ~ '(shooting|paintball)' THEN shooting
      WHEN k ~ 'rafting' THEN rafting
      WHEN k ~ '(paraglid|balloon|helicopter)' THEN air
      WHEN k ~ 'nusa-penida' THEN island
      WHEN rec."slug" IN ('bali-safari', 'bali-marine-safari') THEN park
      WHEN k ~ '(water|jet-?ski|snorkel|scuba|div|sea-walker|flyboard|banana|donut|flying-fish|parasail|boat|surf)' THEN water
      WHEN k ~ '(jeep|vw|horse|tour|temple|trek|hike)' THEN land
      ELSE park END);
  END LOOP;
END $$;
