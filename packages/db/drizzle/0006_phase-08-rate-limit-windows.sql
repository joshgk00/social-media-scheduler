ALTER TABLE "posts" ADD COLUMN "platform" varchar(16) DEFAULT 'twitter' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "visibility" varchar(16);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "link_url" text;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_daily_limit" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_daily_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_window_start_utc" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "facebook_hourly_limit" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "facebook_hourly_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "facebook_window_start_utc" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "linkedin_account_type" varchar(16) DEFAULT 'person' NOT NULL;