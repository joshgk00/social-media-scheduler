ALTER TABLE "post_media" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "post_media" pm
SET "user_id" = p."user_id"
FROM "posts" p
WHERE pm."post_id" = p."id"
  AND pm."user_id" IS NULL;--> statement-breakpoint
UPDATE "post_media" pm
SET "user_id" = sp."user_id"
FROM "social_profiles" sp
WHERE pm."user_id" IS NULL
  AND split_part(pm."file_path", '/', 2) = sp."id"::text;--> statement-breakpoint
DELETE FROM "post_media"
WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "post_media" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_media_user_id" ON "post_media" USING btree ("user_id");
