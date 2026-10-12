CREATE TABLE "place_tags" (
	"place_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "place_tags_place_id_tag_id_pk" PRIMARY KEY("place_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"features" jsonb,
	"icon" varchar(32),
	"price_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"entitlement_kind" varchar(32) NOT NULL,
	"duration_days" integer,
	"device_limit" integer DEFAULT 2 NOT NULL,
	"can_use_trip" boolean DEFAULT true NOT NULL,
	"can_save_favorites" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"day_number" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "is_hidden_gem" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "can_favorite" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "can_add_to_trip" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "detailed_description" jsonb;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "videos" jsonb;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "place_tags" ADD CONSTRAINT "place_tags_place_id_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."map_places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_tags" ADD CONSTRAINT "place_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_items" ADD CONSTRAINT "trip_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_items" ADD CONSTRAINT "trip_items_place_id_map_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."map_places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_tags_tag_idx" ON "place_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "plans_status_sort_idx" ON "plans" USING btree ("status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_key_unique" ON "tags" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_items_user_place_unique" ON "trip_items" USING btree ("user_id","place_id");--> statement-breakpoint
CREATE INDEX "trip_items_user_order_idx" ON "trip_items" USING btree ("user_id","day_number","position");--> statement-breakpoint
ALTER TABLE "map_places" ADD CONSTRAINT "map_places_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_places_region_idx" ON "map_places" USING btree ("region_id");
--> statement-breakpoint
-- البيانات: الباقتان الحاليتان من tiers.ts تصبحان صفوفاً منشورة بنفس السعر والصلاحية.
-- مدى الحياة (duration_days NULL) كما كانت، مع حد أجهزة 2 للخريطة و3 لـ VIP.
INSERT INTO "plans" ("slug","name","description","features","icon","price_minor","currency","entitlement_kind","duration_days","device_limit","featured","sort_order","status","published_at")
VALUES
  ('map','{"en": "Map Access", "ar": "الوصول للخريطة", "id": "Akses Peta"}','{"en": "The whole interactive map, unlocked.", "ar": "الخريطة التفاعلية كاملة، مفتوحة.", "id": "Seluruh peta interaktif, terbuka."}','[{"en": "Everything in Explorer", "ar": "كل ما في المستكشف", "id": "Semua di Explorer"}, {"en": "Full interactive map unlocked", "ar": "الخريطة التفاعلية كاملة", "id": "Peta interaktif penuh"}, {"en": "Hours, photos & ratings for every pin", "ar": "ساعات وصور وتقييمات لكل نقطة", "id": "Jam, foto & rating tiap pin"}, {"en": "Save places to your trip", "ar": "احفظ الأماكن في رحلتك", "id": "Simpan tempat ke trip"}]','pin',1900,'USD','map_access',NULL,2,true,10,'published',now()),
  ('vip','{"en": "VIP · Hidden Gems", "ar": "VIP · الكنوز الخفية", "id": "VIP · Permata Tersembunyi"}','{"en": "Everything, plus secret spots & priority support.", "ar": "كل شيء، إضافةً لأماكن سرية ودعم بأولوية.", "id": "Semuanya, plus tempat rahasia & dukungan prioritas."}','[{"en": "Everything in Map Access", "ar": "كل ما في وصول الخريطة", "id": "Semua di Akses Peta"}, {"en": "Hidden Gems & VIP-only places", "ar": "الكنوز الخفية وأماكن VIP", "id": "Permata tersembunyi & tempat VIP"}, {"en": "Priority WhatsApp support", "ar": "دعم واتساب بأولوية", "id": "Dukungan WhatsApp prioritas"}, {"en": "Seasonal itinerary updates", "ar": "تحديثات موسمية للجداول", "id": "Pembaruan itinerari musiman"}]','gem',3900,'USD','vip',NULL,3,false,20,'published',now())
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
-- الوسوم: من نصوص map_places.tags الحالية، بمفتاح مشتق (Luxury Stays → luxury-stays).
INSERT INTO "tags" ("key","label")
SELECT DISTINCT
  trim(both '-' from regexp_replace(lower(t.value), '[^a-z0-9]+', '-', 'g')),
  jsonb_build_object('en', t.value, 'ar', t.value, 'id', t.value)
FROM "map_places" p, jsonb_array_elements_text(coalesce(p."tags", '[]'::jsonb)) AS t(value)
WHERE trim(t.value) <> ''
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "tags" ("key","label") VALUES
  ('hidden-gems','{"en":"Hidden Gems","ar":"جواهر مخفية","id":"Permata Tersembunyi"}'),
  ('specialty-coffee','{"en":"Specialty Coffee","ar":"قهوة مختصة","id":"Kopi Spesialti"}'),
  ('romantic','{"en":"Romantic","ar":"رومانسي","id":"Romantis"}'),
  ('family','{"en":"Family","ar":"عائلي","id":"Keluarga"}'),
  ('budget','{"en":"Budget","ar":"اقتصادي","id":"Hemat"}'),
  ('adventure','{"en":"Adventure","ar":"مغامرة","id":"Petualangan"}')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "place_tags" ("place_id","tag_id")
SELECT DISTINCT p."id", g."id"
FROM "map_places" p, jsonb_array_elements_text(coalesce(p."tags", '[]'::jsonb)) AS t(value)
JOIN "tags" g ON g."key" = trim(both '-' from regexp_replace(lower(t.value), '[^a-z0-9]+', '-', 'g'))
ON CONFLICT DO NOTHING;
