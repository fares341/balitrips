-- Client, Oct 2026: the activity card «معبد وبحيرة أولون دانو براتان» becomes
-- «حديقة وبحيرة براتان», and its texts describe the lake and gardens.
-- The slug (the page link) stays the same so shared links keep working.
-- Matches the row by slug; does nothing where it is missing (fresh DB / CI).

UPDATE "activities"
SET
  "name" = COALESCE("name", '{}'::jsonb) || jsonb_build_object(
    'ar', 'حديقة وبحيرة براتان',
    'en', 'Beratan Lake & Gardens',
    'id', 'Taman dan Danau Beratan'),
  "short_description" = COALESCE("short_description", '{}'::jsonb) || jsonb_build_object(
    'ar', 'من أجمل مناطق بالي الجبلية: بحيرة براتان الهادئة وحدائقها الخضراء وسط الجبال والضباب، بأجواء باردة منعشة.',
    'en', 'One of Bali''s most beautiful highland spots: calm Lake Beratan and its green gardens among misty mountains and cool air.',
    'id', 'Salah satu kawasan pegunungan terindah di Bali: Danau Beratan yang tenang dan tamannya yang hijau di antara gunung berkabut dan udara sejuk.'),
  "headline" = CASE
    WHEN "headline" IS NULL THEN NULL
    ELSE "headline" || jsonb_build_object(
      'ar', 'بحيرة جبلية هادئة وحدائق خضراء وسط الضباب',
      'en', 'A calm mountain lake and green gardens in the mist',
      'id', 'Danau pegunungan yang tenang dan taman hijau di tengah kabut')
  END,
  "description" = CASE
    WHEN "description" IS NULL THEN NULL
    WHEN ("description"::text ~* '(معبد|temple|pura )') THEN "description" || jsonb_build_object(
      'ar', 'نصف يوم في منطقة بيدوغول الجبلية شمال بالي: بحيرة براتان الهادئة المحاطة بالجبال، وحدائقها الخضراء المرتبة على ضفتها، وأجواء باردة منعشة وضباب يزيد المكان جمالاً. وقت للتصوير والتمشية على الضفة والاستمتاع بالمناظر.',
      'en', 'Half a day in the Bedugul highlands of North Bali: calm Lake Beratan ringed by mountains, the green, well-kept gardens on its shore, cool fresh air and mist that makes the place even more beautiful. Time for photos, a walk along the shore and the views.',
      'id', 'Setengah hari di dataran tinggi Bedugul, Bali Utara: Danau Beratan yang tenang dikelilingi pegunungan, taman hijau yang tertata di tepinya, udara sejuk dan kabut yang membuat tempat ini semakin indah. Waktu untuk berfoto, berjalan di tepi danau, dan menikmati pemandangan.')
    ELSE "description"
  END,
  "updated_at" = now()
WHERE "slug" = 'ulun-danu-beratan-lake-temple';
