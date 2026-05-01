ALTER TYPE "public"."post_status" ADD VALUE IF NOT EXISTS 'paused';--> statement-breakpoint
CREATE TYPE "public"."bulk_operation_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."bulk_operation_target_kind" AS ENUM('profile', 'queue', 'scheduled-list');--> statement-breakpoint
CREATE TABLE "bulk_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation_type" varchar(64) NOT NULL,
	"target_kind" "bulk_operation_target_kind" NOT NULL,
	"target_id" uuid,
	"status" "bulk_operation_status" DEFAULT 'queued' NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"error_report_path" text,
	"idempotency_key" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bulk_operations" ADD CONSTRAINT "bulk_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_operations_user_status_idx" ON "bulk_operations" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "bulk_operations_user_created_idx" ON "bulk_operations" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bulk_operations_idempotency_idx" ON "bulk_operations" USING btree ("idempotency_key");
