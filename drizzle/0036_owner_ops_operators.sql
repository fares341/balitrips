-- Owner questions (Oct 2026): the operator of each activity and its contract.
-- Additive and guarded: a new table only, created if missing; a second run
-- changes nothing, and nothing existing is altered or deleted.
-- Staff-only data: no public page or API reads this table. The contract PDF
-- itself is kept in private storage; only its key is stored here.

CREATE TABLE IF NOT EXISTS "activity_operators" (
  "activity_id" uuid PRIMARY KEY REFERENCES "activities"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL DEFAULT '',
  "contact_person" varchar(200) NOT NULL DEFAULT '',
  "phone" varchar(40) NOT NULL DEFAULT '',
  "email" varchar(200) NOT NULL DEFAULT '',
  "commission_notes" text NOT NULL DEFAULT '',
  "cancellation_terms" text NOT NULL DEFAULT '',
  "contract_key" text,
  "contract_filename" varchar(200),
  "contract_bytes" integer,
  "contract_uploaded_at" timestamptz,
  "contract_uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "contract_summary" jsonb,
  "summary_model" varchar(120),
  "summary_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- To undo: DROP TABLE IF EXISTS "activity_operators";
