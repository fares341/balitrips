-- CI ONLY (preview-shots workflow): one demo activity laid out like the
-- client's reference design (swing over the jungle, four packages, five
-- extras), so the v2 activity page can be screenshotted against it.
-- The prices are the reference image's sample prices — NOT approved, never
-- run against the live database. Photos are borrowed from seeded activities.

BEGIN;

CREATE TEMP TABLE pics AS
SELECT m.id, row_number() OVER (ORDER BY a.sort_order, m.id) AS n
FROM activities a JOIN media m ON m.id = a.hero_image_id
WHERE a.deleted_at IS NULL;

INSERT INTO activities (
  slug, name, area, description, short_description, duration, region_id, primary_category_id,
  price_minor, currency, hero_image_id, included, excluded, suitable_for, important_notes,
  what_to_bring, age_conditions, faq, meeting_point, meeting_map_url, meeting_time_note,
  instant_confirmation, free_cancellation_hours, min_guests, max_guests, lead_time_hours,
  time_slots, status, published_at, sort_order
) VALUES (
  'ci-demo-swing',
  '{"ar":"أرجوحة أوبود (تجريبي)","en":"Ubud Jungle Swing (demo)","id":"Ayunan Ubud (demo)"}',
  '{"ar":"أوبود - بالي","en":"Ubud - Bali","id":"Ubud - Bali"}',
  '{"ar":"استمتع بإطلالات ساحرة على الغابات الخضراء والمدرجات الزراعية في واحدة من أجمل التجارب التصويرية والترفيهية في بالي.","en":"Enjoy stunning views over green jungle and rice terraces in one of Bali’s most photogenic experiences.","id":""}',
  '{"ar":"استمتع بإطلالات ساحرة على الغابات الخضراء والمدرجات الزراعية في واحدة من أجمل التجارب التصويرية والترفيهية في بالي. مناسبة للأفراد والعائلات والأزواج.","en":"Stunning views over green jungle and rice terraces — one of Bali’s most photogenic experiences. For singles, families and couples.","id":""}',
  '{"ar":"2 - 3 ساعات","en":"2–3 hours","id":"2–3 jam"}',
  (SELECT id FROM regions WHERE key = 'ubud' LIMIT 1),
  (SELECT id FROM categories WHERE key = 'adventure' LIMIT 1),
  12000, 'USD',
  (SELECT id FROM pics WHERE n = 1),
  '[{"ar":"دخول كامل إلى الموقع","en":"Full site entry","id":""}]',
  '[{"ar":"مواصلات من وإلى الفندق","en":"Hotel transfers","id":""},{"ar":"غداء أو وجبات","en":"Lunch or meals","id":""},{"ar":"مشتريات أو تذكارات","en":"Purchases or souvenirs","id":""},{"ar":"مصاريف شخصية","en":"Personal expenses","id":""}]',
  '[{"ar":"الأفراد","en":"Singles","id":""},{"ar":"الأزواج","en":"Couples","id":""},{"ar":"العائلات","en":"Families","id":""},{"ar":"صناع المحتوى","en":"Content creators","id":""},{"ar":"مجموعات الأصدقاء","en":"Groups of friends","id":""}]',
  '[{"ar":"يرجى الحضور قبل الموعد بـ 15 دقيقة","en":"Please arrive 15 minutes early","id":""},{"ar":"ارتداء ملابس مناسبة للتصوير","en":"Wear clothes suited to photos","id":""},{"ar":"النشاط قد يتأثر بالطقس","en":"The activity may depend on the weather","id":""},{"ar":"الأطفال برفقة شخص بالغ","en":"Children with an adult","id":""}]',
  '[{"ar":"ملابس مريحة","en":"Comfortable clothes","id":""},{"ar":"حذاء مناسب للمشي","en":"Walking shoes","id":""},{"ar":"واقي شمس","en":"Sunscreen","id":""},{"ar":"نظارة شمسية","en":"Sunglasses","id":""},{"ar":"كاميرا أو هاتف للتصوير","en":"Camera or phone","id":""}]',
  '[{"ar":"مناسب لجميع الأعمار","en":"All ages","id":""},{"ar":"الأطفال برفقة شخص بالغ","en":"Children with an adult","id":""},{"ar":"قد لا يكون مناسبًا للحوامل","en":"May not suit pregnancy","id":""},{"ar":"يرجى إبلاغنا بأي حالة صحية خاصة","en":"Tell us about any health condition","id":""}]',
  '[{"q":{"ar":"هل يمكن الحجز في نفس اليوم؟","en":"Can I book the same day?","id":""},"a":{"ar":"حسب الإتاحة لدى المشغل.","en":"Subject to availability.","id":""}},{"q":{"ar":"هل التصوير مشمول؟","en":"Are photos included?","id":""},"a":{"ar":"حسب الباقة المختارة.","en":"Depends on the package.","id":""}}]',
  '{"ar":"موقع الأرجوحة في أوبود\nأوبود - بالي، إندونيسيا","en":"Swing site, Ubud\nUbud - Bali, Indonesia","id":""}',
  'https://www.google.com/maps/search/?api=1&query=-8.4321,115.2793',
  '{"ar":"يوميًا، صباحًا","en":"Daily, mornings","id":""}',
  true, 24, 1, 10, 24, '[]', 'published', now(), -1
);

INSERT INTO activity_images (activity_id, media_id, sort_order)
SELECT (SELECT id FROM activities WHERE slug = 'ci-demo-swing'), id, n
FROM pics WHERE n BETWEEN 2 AND 5;

INSERT INTO activity_categories (activity_id, category_id)
SELECT (SELECT id FROM activities WHERE slug = 'ci-demo-swing'), id FROM categories WHERE key = 'adventure';

INSERT INTO activity_tiers (activity_id, key, name, tagline, price_minor, currency, pricing_mode, max_guests,
  is_popular, badge_label, image_id, description, features, includes, sort_order, status, published_at)
VALUES
((SELECT id FROM activities WHERE slug = 'ci-demo-swing'), 'couples',
 '{"ar":"باقة الأزواج","en":"Couples package","id":""}', '{"ar":"تجربة مثالية للأزواج","en":"Made for couples","id":""}',
 18000, 'USD', 'per_couple', 10, false, NULL, NULL, NULL,
 '[{"ar":"دخول شخصين","en":"Entry for two","id":""},{"ar":"جلسة تصوير احترافي","en":"Pro photo session","id":""},{"ar":"مشروب ترحيبي","en":"Welcome drink","id":""},{"ar":"تنسيق مخصص للأزواج","en":"Couple styling","id":""},{"ar":"وقت خاص للتصوير","en":"Private photo time","id":""}]',
 '[]', 0, 'published', now()),
((SELECT id FROM activities WHERE slug = 'ci-demo-swing'), 'basic',
 '{"ar":"الباقة الأساسية","en":"Basic package","id":""}', '{"ar":"تجربة أساسية بأفضل سعر","en":"The essentials, best price","id":""}',
 12000, 'USD', 'per_person', NULL, false, NULL, NULL, NULL,
 '[{"ar":"دخول كامل للموقع","en":"Full entry","id":""},{"ar":"مرشد سياحي مشترك","en":"Shared guide","id":""},{"ar":"دخول مناطق التصوير","en":"Photo spots","id":""},{"ar":"مساعدة في التوجيه","en":"Directions help","id":""},{"ar":"وقت حر للاستمتاع","en":"Free time","id":""}]',
 '[]', 1, 'published', now()),
((SELECT id FROM activities WHERE slug = 'ci-demo-swing'), 'complete',
 '{"ar":"الباقة الشاملة","en":"Complete package","id":""}', '{"ar":"تجربة متوازنة مع أهم الإضافات","en":"Balanced, with the key extras","id":""}',
 20000, 'USD', 'per_person', NULL, false, NULL, NULL, NULL,
 '[{"ar":"دخول كامل للموقع","en":"Full entry","id":""},{"ar":"تصوير احترافي","en":"Pro photos","id":""},{"ar":"مرشد سياحي","en":"Guide","id":""},{"ar":"مشروب ترحيبي","en":"Welcome drink","id":""},{"ar":"وقت إضافي للتصوير","en":"Extra photo time","id":""},{"ar":"دخول سريع","en":"Fast entry","id":""}]',
 '[]', 2, 'published', now()),
((SELECT id FROM activities WHERE slug = 'ci-demo-swing'), 'premium',
 '{"ar":"الباقة المميزة","en":"Premium package","id":""}', '{"ar":"تجربة متكاملة مع جميع الإضافات","en":"Everything included","id":""}',
 24000, 'USD', 'per_person', NULL, true, NULL, (SELECT id FROM pics WHERE n = 1),
 '{"ar":"استمتع بتجربة متكاملة مع جميع الإضافات","en":"The full experience with every extra","id":""}',
 '[{"ar":"دخول كامل للموقع","en":"Full entry","id":""},{"ar":"تصوير احترافي موسع","en":"Extended pro photos","id":""},{"ar":"مرشد سياحي خاص","en":"Private guide","id":""},{"ar":"مشروب ترحيبي","en":"Welcome drink","id":""},{"ar":"دخول سريع","en":"Fast entry","id":""}]',
 '[{"ar":"دخول كامل إلى لوكيشن التصوير","en":"Full access to the photo spots","id":""},{"ar":"مرشد سياحي خاص","en":"Private guide","id":""},{"ar":"تصوير احترافي موسع","en":"Extended pro photos","id":""},{"ar":"مشروب ترحيبي","en":"Welcome drink","id":""},{"ar":"دخول سريع","en":"Fast entry","id":""},{"ar":"وقت إضافي للتصوير","en":"Extra photo time","id":""},{"ar":"مساعدة في التنسيق","en":"Styling help","id":""}]',
 3, 'published', now());

-- Extras: library add-ons with pictures, linked to the demo activity.
INSERT INTO addons_library (name, unit_label, image_id, price_minor, currency, pricing, max_qty, sort_order)
VALUES
('{"ar":"مواصلات خاصة","en":"Private transfer","id":""}', '{"ar":"من وإلى الفندق","en":"hotel return","id":""}', (SELECT id FROM pics WHERE n = 6), 3500, 'USD', 'per_booking', NULL, 900),
('{"ar":"غداء","en":"Lunch","id":""}', '{"ar":"للشخص","en":"per person","id":""}', (SELECT id FROM pics WHERE n = 7), 1500, 'USD', 'per_person', NULL, 901),
('{"ar":"سنوركلينغ","en":"Snorkelling","id":""}', '{"ar":"للشخص","en":"per person","id":""}', (SELECT id FROM pics WHERE n = 8), 3000, 'USD', 'per_person', NULL, 902),
('{"ar":"تصوير درون","en":"Drone video","id":""}', '{"ar":"للحجز","en":"per booking","id":""}', (SELECT id FROM pics WHERE n = 9), 4000, 'USD', 'per_booking', NULL, 903),
('{"ar":"جلسة تصوير إضافية","en":"Extra photo session","id":""}', '{"ar":"20 صورة احترافية","en":"20 pro photos","id":""}', (SELECT id FROM pics WHERE n = 10), 2500, 'USD', 'per_booking', NULL, 904);

INSERT INTO activity_addon_links (activity_id, addon_id, sort_order)
SELECT (SELECT id FROM activities WHERE slug = 'ci-demo-swing'), id, sort_order - 900
FROM addons_library WHERE sort_order BETWEEN 900 AND 904;

-- Two hand-picked related activities.
UPDATE activities SET related_ids = (
  SELECT jsonb_agg(id) FROM (SELECT id FROM activities WHERE slug <> 'ci-demo-swing' AND status = 'published' ORDER BY sort_order LIMIT 2) r
) WHERE slug = 'ci-demo-swing';

COMMIT;
