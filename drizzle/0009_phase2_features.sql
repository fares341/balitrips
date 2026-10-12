-- Phase 2 (spec features that did not exist). See docs/phase2-new-features.md.
--
-- Sign-in by mobile number (spec §3.1/3.2): a normalised, unique phone column.
ALTER TABLE "users" ADD COLUMN "phone_normalized" varchar(20);--> statement-breakpoint
-- Backfill international numbers only; keep the first account when two share a number.
UPDATE "users" u SET "phone_normalized" = n.norm
FROM (
  SELECT id, norm, row_number() OVER (PARTITION BY norm ORDER BY created_at) AS rn
  FROM (
    SELECT id, created_at,
      '+' || CASE WHEN btrim(phone) LIKE '00%' THEN substr(regexp_replace(phone, '\D', '', 'g'), 3)
                  ELSE regexp_replace(phone, '\D', '', 'g') END AS norm
    FROM "users"
    WHERE phone IS NOT NULL AND (btrim(phone) LIKE '+%' OR btrim(phone) LIKE '00%')
  ) x
) n
WHERE u.id = n.id AND n.rn = 1 AND length(n.norm) BETWEEN 9 AND 16 AND n.norm NOT LIKE '+0%';--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_normalized_unique" ON "users" USING btree ("phone_normalized");
--> statement-breakpoint
-- Family plan (spec §13.1/13.3/14.3): members per plan, and the invited members.
ALTER TABLE "plans" ADD COLUMN "max_members" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE "plan_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_entitlement_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"invite_email" varchar(256) NOT NULL,
	"member_user_id" uuid,
	"member_entitlement_id" uuid,
	"status" varchar(16) DEFAULT 'invited' NOT NULL,
	"token_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "plan_members" ADD CONSTRAINT "plan_members_owner_entitlement_id_entitlements_id_fk" FOREIGN KEY ("owner_entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_members" ADD CONSTRAINT "plan_members_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_members" ADD CONSTRAINT "plan_members_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_members" ADD CONSTRAINT "plan_members_member_entitlement_id_entitlements_id_fk" FOREIGN KEY ("member_entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_members_owner_idx" ON "plan_members" USING btree ("owner_entitlement_id");--> statement-breakpoint
CREATE INDEX "plan_members_email_idx" ON "plan_members" USING btree ("invite_email");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_members_token_unique" ON "plan_members" USING btree ("token_hash");--> statement-breakpoint
-- A shared grant is marked so it cannot itself be re-shared.
ALTER TABLE "entitlements" ADD COLUMN "shared_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Map place gallery and sub-categories (spec §6.3).
ALTER TABLE "map_places" ADD COLUMN "gallery_image_ids" jsonb;--> statement-breakpoint
ALTER TABLE "map_places" ADD COLUMN "sub_category_ids" jsonb;
