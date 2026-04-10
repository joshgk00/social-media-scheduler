CREATE TYPE "public"."post_attempt_outcome" AS ENUM('success', 'transient_fail', 'permanent_fail', 'cancelled');--> statement-breakpoint
CREATE TABLE "post_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"attempt_num" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" "post_attempt_outcome" NOT NULL,
	"http_status" integer,
	"error_code" text,
	"error_message" text,
	"platform_post_id" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "monthly_tweet_budget" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "warn_threshold_percent" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "post_attempts" ADD CONSTRAINT "post_attempts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_attempts_post_started_idx" ON "post_attempts" USING btree ("post_id","started_at");