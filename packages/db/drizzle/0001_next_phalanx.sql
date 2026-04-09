ALTER TABLE "posts" DROP CONSTRAINT "posts_profile_id_social_profiles_id_fk";
--> statement-breakpoint
DROP INDEX "social_profiles_user_platform_account";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_profile_id_social_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."social_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_media_post_id" ON "post_media" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_profile_status" ON "posts" USING btree ("profile_id","status");--> statement-breakpoint
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_user_platform_account" UNIQUE NULLS NOT DISTINCT("user_id","platform","platform_user_id");