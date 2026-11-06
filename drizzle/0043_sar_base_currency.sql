-- One base currency: SAR (owner decision, Nov 2026).
--
-- Every catalog price that is not stored in Saudi riyals is converted to SAR
-- halalas, once, at the current effective rate:
--   USD → SAR  = 1 / currencies.rates.USD if Studio has stored one, else the
--                old vehicles.sarPerUsd, else the 3.75 peg;
--   others     = the shipped Studio table (src/lib/currency/fx.ts →
--                DEFAULT_SAR_RATES), the same table the site displays with.
-- Rounding is half away from zero to the halala, like toSarMinor().
--
-- Converted: activities, activity_tiers (+ child / compare-at prices and
-- their tier_seasonal_prices), activity_addons (+ price_tiers),
-- addons_library (+ price_tiers) and activity_addon_links overrides,
-- itineraries (+ tier_prices), packages, plans, driver_vehicles, coupons with
-- fixed amounts / minimums, open carts (display snapshots), and the
-- `vehicles`, `fees` and `itinerarySales` settings. The USD rate moves from
-- `vehicles.sarPerUsd` into `currencies.rates.USD` (vehicles keeps its copy as
-- a back-compat read).
--
-- NOT touched: orders, order_items, payments, refunds, coupon_redemptions,
-- supplier costs and settlements, custom-trip budgets/quotes already sent.
-- Orders keep the currency they were placed in.
--
-- Guarded and idempotent: only rows whose currency is not SAR (and has a
-- rate) change, so a fresh database passes straight through and a second run
-- changes nothing. Every value changed is first copied to
-- "migration_row_backups" (migration = '0043'), and one 'currency_migration'
-- row in activity_log records the rate and the counts. See «To undo» below.

CREATE TABLE IF NOT EXISTS "migration_row_backups" (
  "id" bigserial PRIMARY KEY,
  "migration" varchar(64) NOT NULL,
  "table_name" varchar(64) NOT NULL,
  "row_id" uuid NOT NULL,
  "column_name" varchar(64) NOT NULL,
  "old_value" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("migration", "table_name", "row_id", "column_name")
);--> statement-breakpoint

DO $migration$
DECLARE
  usd_rate numeric;
  rate_source text;
  n_total integer := 0;
  n integer;
  counts jsonb := '{}'::jsonb;
BEGIN
  -- ---- the effective USD rate --------------------------------------------
  SELECT 1 / NULLIF((value -> 'rates' ->> 'USD')::numeric, 0), 'currencies.rates.USD'
    INTO usd_rate, rate_source
    FROM site_settings WHERE key = 'currencies' AND (value -> 'rates' ->> 'USD') IS NOT NULL;
  IF usd_rate IS NULL THEN
    SELECT (value ->> 'sarPerUsd')::numeric, 'vehicles.sarPerUsd'
      INTO usd_rate, rate_source
      FROM site_settings WHERE key = 'vehicles' AND (value ->> 'sarPerUsd') IS NOT NULL;
  END IF;
  IF usd_rate IS NULL OR usd_rate <= 0 THEN
    usd_rate := 3.75;
    rate_source := 'peg';
  END IF;

  -- SAR per one unit of each currency, and its minor-unit exponent.
  CREATE TEMP TABLE IF NOT EXISTS _fx0043 (code text PRIMARY KEY, sar numeric NOT NULL, exp int NOT NULL) ON COMMIT DROP;
  DELETE FROM _fx0043;
  INSERT INTO _fx0043 VALUES
    ('USD', usd_rate, 2),
    ('EUR', 1 / 0.2453, 2), ('GBP', 1 / 0.208, 2), ('EGP', 1 / 12.93, 2),
    ('AED', 1 / 0.9793, 2), ('KWD', 1 / 0.0819, 3), ('QAR', 1 / 0.9707, 2),
    ('BHD', 1 / 0.1003, 3), ('OMR', 1 / 0.1025, 3), ('JOD', 1 / 0.1891, 3),
    ('IDR', 1 / 4347, 2), ('TRY', 1 / 9.07, 2), ('MYR', 1 / 1.187, 2);

  -- ---- helpers ------------------------------------------------------------
  CREATE OR REPLACE FUNCTION pg_temp.sar0043(minor numeric, cur text) RETURNS bigint
    LANGUAGE sql STABLE AS $f$
      SELECT CASE WHEN minor IS NULL THEN NULL
                  WHEN upper(cur) = 'SAR' THEN minor::bigint
                  ELSE round(minor / (10 ^ f.exp) * f.sar * 100)::bigint END
      FROM (SELECT 1) one LEFT JOIN _fx0043 f ON f.code = upper(cur)
    $f$;
  CREATE OR REPLACE FUNCTION pg_temp.tiers0043(tiers jsonb, cur text) RETURNS jsonb
    LANGUAGE sql STABLE AS $f$
      SELECT CASE WHEN tiers IS NULL OR jsonb_typeof(tiers) <> 'array' THEN tiers
             ELSE coalesce((SELECT jsonb_agg(
                    CASE WHEN t ? 'priceMinor'
                         THEN jsonb_set(t, '{priceMinor}', to_jsonb(pg_temp.sar0043((t ->> 'priceMinor')::numeric, cur)))
                         ELSE t END ORDER BY o)
                  FROM jsonb_array_elements(tiers) WITH ORDINALITY AS e(t, o)), '[]'::jsonb) END
    $f$;
  CREATE OR REPLACE FUNCTION pg_temp.map0043(prices jsonb, cur text) RETURNS jsonb
    LANGUAGE sql STABLE AS $f$
      SELECT CASE WHEN prices IS NULL OR jsonb_typeof(prices) <> 'object' THEN prices
             ELSE coalesce((SELECT jsonb_object_agg(k,
                    CASE WHEN jsonb_typeof(v) = 'number' THEN to_jsonb(pg_temp.sar0043(v::text::numeric, cur)) ELSE v END)
                  FROM jsonb_each(prices) AS e(k, v)), '{}'::jsonb) END
    $f$;

  -- ---- children first (they take their currency from the parent) ---------
  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'tier_seasonal_prices', s.id, '*',
         jsonb_build_object('price_minor', s.price_minor, 'child_price_minor', s.child_price_minor, 'currency', t.currency)
    FROM tier_seasonal_prices s JOIN activity_tiers t ON t.id = s.tier_id
   WHERE t.currency <> 'SAR' AND t.currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE tier_seasonal_prices s
     SET price_minor = pg_temp.sar0043(s.price_minor, t.currency),
         child_price_minor = pg_temp.sar0043(s.child_price_minor, t.currency)
    FROM activity_tiers t
   WHERE t.id = s.tier_id AND t.currency <> 'SAR' AND t.currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('tier_seasonal_prices', n); n_total := n_total + n;

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'activity_addon_links', l.addon_id, left('price_minor@' || l.activity_id::text, 64),
         jsonb_build_object('price_minor', l.price_minor, 'currency', a.currency, 'activity_id', l.activity_id)
    FROM activity_addon_links l JOIN addons_library a ON a.id = l.addon_id
   WHERE l.price_minor IS NOT NULL AND a.currency <> 'SAR' AND a.currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE activity_addon_links l
     SET price_minor = pg_temp.sar0043(l.price_minor, a.currency)
    FROM addons_library a
   WHERE a.id = l.addon_id AND l.price_minor IS NOT NULL
     AND a.currency <> 'SAR' AND a.currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('activity_addon_links', n); n_total := n_total + n;

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'cart_items', i.id, '*', jsonb_build_object('unit_price_minor', i.unit_price_minor, 'currency', c.currency)
    FROM cart_items i JOIN carts c ON c.id = i.cart_id
   WHERE c.currency <> 'SAR' AND c.currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE cart_items i SET unit_price_minor = pg_temp.sar0043(i.unit_price_minor, c.currency)
    FROM carts c
   WHERE c.id = i.cart_id AND c.currency <> 'SAR' AND c.currency IN (SELECT code FROM _fx0043);

  -- ---- one statement pair per catalog table -------------------------------
  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'carts', id, '*', jsonb_build_object('currency', currency)
    FROM carts WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE carts SET currency = 'SAR' WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'activities', id, '*', jsonb_build_object('price_minor', price_minor, 'currency', currency)
    FROM activities WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE activities SET price_minor = pg_temp.sar0043(price_minor, currency), currency = 'SAR'
   WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('activities', n); n_total := n_total + n;

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'activity_tiers', id, '*',
         jsonb_build_object('price_minor', price_minor, 'child_price_minor', child_price_minor,
                            'compare_at_price_minor', compare_at_price_minor, 'currency', currency)
    FROM activity_tiers WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE activity_tiers
     SET price_minor = pg_temp.sar0043(price_minor, currency),
         child_price_minor = pg_temp.sar0043(child_price_minor, currency),
         compare_at_price_minor = pg_temp.sar0043(compare_at_price_minor, currency),
         currency = 'SAR'
   WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('activity_tiers', n); n_total := n_total + n;

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'activity_addons', id, '*',
         jsonb_build_object('price_minor', price_minor, 'price_tiers', price_tiers, 'currency', currency)
    FROM activity_addons WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE activity_addons
     SET price_minor = pg_temp.sar0043(price_minor, currency),
         price_tiers = pg_temp.tiers0043(price_tiers, currency),
         currency = 'SAR'
   WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('activity_addons', n); n_total := n_total + n;

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'addons_library', id, '*',
         jsonb_build_object('price_minor', price_minor, 'price_tiers', price_tiers, 'currency', currency)
    FROM addons_library WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE addons_library
     SET price_minor = pg_temp.sar0043(price_minor, currency),
         price_tiers = pg_temp.tiers0043(price_tiers, currency),
         currency = 'SAR'
   WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('addons_library', n); n_total := n_total + n;

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'itineraries', id, '*',
         jsonb_build_object('price_minor', price_minor, 'tier_prices', tier_prices, 'currency', currency)
    FROM itineraries WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE itineraries
     SET price_minor = pg_temp.sar0043(price_minor, currency),
         tier_prices = pg_temp.map0043(tier_prices, currency),
         currency = 'SAR'
   WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('itineraries', n); n_total := n_total + n;

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'packages', id, '*', jsonb_build_object('price_minor', price_minor, 'currency', currency)
    FROM packages WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE packages SET price_minor = pg_temp.sar0043(price_minor, currency), currency = 'SAR'
   WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('packages', n); n_total := n_total + n;

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'plans', id, '*', jsonb_build_object('price_minor', price_minor, 'currency', currency)
    FROM plans WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE plans SET price_minor = pg_temp.sar0043(price_minor, currency), currency = 'SAR'
   WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('plans', n); n_total := n_total + n;

  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'driver_vehicles', id, '*', jsonb_build_object('day_rate_minor', day_rate_minor, 'currency', currency)
    FROM driver_vehicles WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE driver_vehicles SET day_rate_minor = pg_temp.sar0043(day_rate_minor, currency), currency = 'SAR'
   WHERE currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('driver_vehicles', n); n_total := n_total + n;

  -- Discounts: a fixed value and a minimum are money; a percent value is not.
  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'coupons', id, '*',
         jsonb_build_object('type', type, 'value', value, 'min_subtotal_minor', min_subtotal_minor, 'currency', currency)
    FROM coupons WHERE currency IS NOT NULL AND currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE coupons
     SET value = CASE WHEN type = 'fixed' THEN pg_temp.sar0043(value, currency) ELSE value END,
         min_subtotal_minor = pg_temp.sar0043(min_subtotal_minor, currency),
         currency = 'SAR'
   WHERE currency IS NOT NULL AND currency <> 'SAR' AND currency IN (SELECT code FROM _fx0043);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coupons', n); n_total := n_total + n;

  -- ---- settings ------------------------------------------------------------
  -- vehicles: a zone priced only in USD gets its SAR price (SAR wins already).
  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'site_settings', md5('vehicles')::uuid, 'vehicles', value
    FROM site_settings
   WHERE key = 'vehicles' AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(coalesce(value -> 'vehicles', '[]')) v,
                   jsonb_array_elements(coalesce(v -> 'zones', '[]')) z
      WHERE jsonb_typeof(z -> 'sar') IS DISTINCT FROM 'number' AND jsonb_typeof(z -> 'usd') = 'number')
  ON CONFLICT DO NOTHING;
  UPDATE site_settings s
     SET value = jsonb_set(s.value, '{vehicles}', (
           SELECT coalesce(jsonb_agg(
                    jsonb_set(v, '{zones}', (
                      SELECT coalesce(jsonb_agg(
                               CASE WHEN jsonb_typeof(z -> 'sar') IS DISTINCT FROM 'number' AND jsonb_typeof(z -> 'usd') = 'number'
                                    THEN jsonb_set(z, '{sar}', to_jsonb(round((z ->> 'usd')::numeric * usd_rate, 2)))
                                    ELSE z END ORDER BY zo), '[]'::jsonb)
                        FROM jsonb_array_elements(coalesce(v -> 'zones', '[]')) WITH ORDINALITY AS ze(z, zo)))
                    ORDER BY vo), '[]'::jsonb)
             FROM jsonb_array_elements(coalesce(s.value -> 'vehicles', '[]')) WITH ORDINALITY AS ve(v, vo))),
         updated_at = now()
   WHERE s.key = 'vehicles' AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(coalesce(s.value -> 'vehicles', '[]')) v,
                   jsonb_array_elements(coalesce(v -> 'zones', '[]')) z
      WHERE jsonb_typeof(z -> 'sar') IS DISTINCT FROM 'number' AND jsonb_typeof(z -> 'usd') = 'number');

  -- fees: the flat booking fee in SAR.
  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'site_settings', md5('fees')::uuid, 'fees', value
    FROM site_settings WHERE key = 'fees' AND upper(coalesce(value ->> 'feeCurrency', 'SAR')) <> 'SAR'
     AND upper(value ->> 'feeCurrency') IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE site_settings
     SET value = value || jsonb_build_object(
           'bookingFeeMinor', pg_temp.sar0043(coalesce((value ->> 'bookingFeeMinor')::numeric, 0), value ->> 'feeCurrency'),
           'feeCurrency', 'SAR'),
         updated_at = now()
   WHERE key = 'fees' AND upper(coalesce(value ->> 'feeCurrency', 'SAR')) <> 'SAR'
     AND upper(value ->> 'feeCurrency') IN (SELECT code FROM _fx0043);

  -- itinerarySales: prices typed in another currency (the default was SAR).
  INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
  SELECT '0043', 'site_settings', md5('itinerarySales')::uuid, 'itinerarySales', value
    FROM site_settings WHERE key = 'itinerarySales' AND upper(coalesce(value ->> 'currency', 'SAR')) <> 'SAR'
     AND upper(value ->> 'currency') IN (SELECT code FROM _fx0043)
  ON CONFLICT DO NOTHING;
  UPDATE site_settings
     SET value = value || jsonb_build_object(
           'mapBundlePriceMinor', pg_temp.sar0043(coalesce((value ->> 'mapBundlePriceMinor')::numeric, 0), value ->> 'currency'),
           'defaultPrices', pg_temp.tiers0043(coalesce(value -> 'defaultPrices', '[]'::jsonb), value ->> 'currency'),
           'currency', 'SAR'),
         updated_at = now()
   WHERE key = 'itinerarySales' AND upper(coalesce(value ->> 'currency', 'SAR')) <> 'SAR'
     AND upper(value ->> 'currency') IN (SELECT code FROM _fx0043);

  -- currencies: the one FX source. Takes the USD rate from vehicles (moved,
  -- not copied by hand) and fixes the base currency to SAR.
  IF rate_source = 'vehicles.sarPerUsd' THEN
    INSERT INTO migration_row_backups (migration, table_name, row_id, column_name, old_value)
    SELECT '0043', 'site_settings', md5('currencies')::uuid, 'currencies', value
      FROM site_settings WHERE key = 'currencies'
    ON CONFLICT DO NOTHING;
    INSERT INTO site_settings (key, value)
    VALUES ('currencies', jsonb_build_object(
      'baseCurrency', 'SAR',
      'rates', jsonb_build_object('USD', round(1 / usd_rate, 6)),
      'ratesSource', 'default'))
    ON CONFLICT (key) DO UPDATE
      SET value = site_settings.value
                  || jsonb_build_object('baseCurrency', 'SAR')
                  || jsonb_build_object('rates', coalesce(site_settings.value -> 'rates', '{}'::jsonb)
                                                 || jsonb_build_object('USD', round(1 / usd_rate, 6))),
          updated_at = now();
  ELSE
    UPDATE site_settings SET value = value || jsonb_build_object('baseCurrency', 'SAR'), updated_at = now()
     WHERE key = 'currencies' AND coalesce(value ->> 'baseCurrency', '') <> 'SAR';
  END IF;

  -- ---- one summary row ----------------------------------------------------
  IF n_total > 0 THEN
    INSERT INTO activity_log (action, details)
    VALUES ('currency_migration', jsonb_build_object(
      'migration', '0043', 'sarPerUsd', usd_rate, 'rateSource', rate_source, 'rows', counts));
  END IF;
END
$migration$;

-- To undo (restores every converted value exactly; run in one transaction):
--   UPDATE activities a SET price_minor = (b.old_value->>'price_minor')::bigint, currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'activities' AND b.row_id = a.id;
--   UPDATE activity_tiers t SET price_minor = (b.old_value->>'price_minor')::bigint,
--          child_price_minor = (b.old_value->>'child_price_minor')::bigint,
--          compare_at_price_minor = (b.old_value->>'compare_at_price_minor')::bigint, currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'activity_tiers' AND b.row_id = t.id;
--   UPDATE tier_seasonal_prices s SET price_minor = (b.old_value->>'price_minor')::bigint,
--          child_price_minor = (b.old_value->>'child_price_minor')::bigint
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'tier_seasonal_prices' AND b.row_id = s.id;
--   UPDATE activity_addons x SET price_minor = (b.old_value->>'price_minor')::bigint, price_tiers = b.old_value->'price_tiers',
--          currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'activity_addons' AND b.row_id = x.id;
--   UPDATE addons_library x SET price_minor = (b.old_value->>'price_minor')::bigint, price_tiers = b.old_value->'price_tiers',
--          currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'addons_library' AND b.row_id = x.id;
--   UPDATE activity_addon_links l SET price_minor = (b.old_value->>'price_minor')::bigint
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'activity_addon_links'
--      AND b.row_id = l.addon_id AND (b.old_value->>'activity_id')::uuid = l.activity_id;
--   UPDATE itineraries i SET price_minor = (b.old_value->>'price_minor')::bigint, tier_prices = b.old_value->'tier_prices',
--          currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'itineraries' AND b.row_id = i.id;
--   UPDATE packages p SET price_minor = (b.old_value->>'price_minor')::bigint, currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'packages' AND b.row_id = p.id;
--   UPDATE plans p SET price_minor = (b.old_value->>'price_minor')::bigint, currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'plans' AND b.row_id = p.id;
--   UPDATE driver_vehicles v SET day_rate_minor = (b.old_value->>'day_rate_minor')::bigint, currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'driver_vehicles' AND b.row_id = v.id;
--   UPDATE coupons c SET value = (b.old_value->>'value')::bigint,
--          min_subtotal_minor = (b.old_value->>'min_subtotal_minor')::bigint, currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'coupons' AND b.row_id = c.id;
--   UPDATE cart_items i SET unit_price_minor = (b.old_value->>'unit_price_minor')::bigint
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'cart_items' AND b.row_id = i.id;
--   UPDATE carts c SET currency = b.old_value->>'currency'
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'carts' AND b.row_id = c.id;
--   UPDATE site_settings s SET value = b.old_value
--     FROM migration_row_backups b WHERE b.migration = '0043' AND b.table_name = 'site_settings'
--      AND b.column_name = s.key;
--   -- a `currencies` row created by this migration (no backup) can simply be deleted:
--   -- DELETE FROM site_settings WHERE key = 'currencies' AND value->>'ratesSource' = 'default';
--   DELETE FROM migration_row_backups WHERE migration = '0043';
-- Then deploy the previous release (the code before this migration expects USD).
