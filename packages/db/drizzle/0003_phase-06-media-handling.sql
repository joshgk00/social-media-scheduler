CREATE TYPE "public"."transcode_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'not_applicable');--> statement-breakpoint
CREATE TABLE "queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"interval_type" varchar(10) DEFAULT 'fixed' NOT NULL,
	"interval_value" integer DEFAULT 4 NOT NULL,
	"interval_unit" varchar(10) DEFAULT 'hours' NOT NULL,
	"days_of_week" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"hour_slots" jsonb DEFAULT '[9,12,15,18]'::jsonb NOT NULL,
	"seasonal_start" varchar(5),
	"seasonal_end" varchar(5),
	"seasonal_repeat" boolean DEFAULT false NOT NULL,
	"is_recycling" boolean DEFAULT false NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"cursor_position" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp with time zone,
	"last_published_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_media" ALTER COLUMN "post_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "post_media" ADD COLUMN "transcode_status" "transcode_status" DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_media" ADD COLUMN "transcode_error" text;--> statement-breakpoint
ALTER TABLE "post_media" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "queue_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "queue_position" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "destroyed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "queues" ADD CONSTRAINT "queues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queues" ADD CONSTRAINT "queues_profile_id_social_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."social_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "queues_user_id" ON "queues" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "queues_profile_id" ON "queues" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "queues_next_run" ON "queues" USING btree ("next_run_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_queue_id_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."queues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_media_deleted_at" ON "post_media" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "post_media_transcode_status" ON "post_media" USING btree ("transcode_status");--> statement-breakpoint
CREATE INDEX "posts_queue_position" ON "posts" USING btree ("queue_id","queue_position");