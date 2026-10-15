-- AI assistants (public website + Studio): conversations, visible messages,
-- proposed actions awaiting a Confirm click, and the daily usage counters
-- behind the per-IP cap and the global budget.
--
-- Nothing secret is stored: the browser token and the IP are HMACs (keyed
-- with the server secret). Conversations older than ASSISTANT_RETENTION_DAYS
-- (default 90) are deleted by the worker's daily prune job; messages and
-- actions cascade with them.
CREATE TABLE IF NOT EXISTS "assistant_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(16) NOT NULL,
	"owner_hash" varchar(64) NOT NULL,
	"user_id" uuid,
	"ip_hash" varchar(64),
	"locale" varchar(8) NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"last_model" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_conv_owner_idx" ON "assistant_conversations" USING btree ("owner_hash","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_conv_kind_idx" ON "assistant_conversations" USING btree ("kind","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"tools" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_msg_conv_idx" ON "assistant_messages" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"kind" varchar(48) NOT NULL,
	"args" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"executed_by" uuid,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_action_conv_idx" ON "assistant_actions" USING btree ("conversation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_usage" (
	"day" date NOT NULL,
	"scope" varchar(80) NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "assistant_usage_day_scope_pk" PRIMARY KEY("day","scope")
);
