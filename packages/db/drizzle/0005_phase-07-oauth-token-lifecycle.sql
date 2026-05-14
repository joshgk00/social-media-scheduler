ALTER TABLE "social_profiles" DROP CONSTRAINT "social_profiles_user_platform_account";--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "platform_account_id" varchar(255);--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "oauth2_access_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "oauth2_access_token_iv" varchar(64);--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "oauth2_access_token_auth_tag" varchar(64);--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "oauth2_refresh_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "oauth2_refresh_token_iv" varchar(64);--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "oauth2_refresh_token_auth_tag" varchar(64);--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "token_status" varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "token_health_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_user_platform_account" UNIQUE NULLS NOT DISTINCT("user_id","platform","platform_user_id","platform_account_id");