CREATE TYPE "public"."snippet_category" AS ENUM('hashtag_set', 'text');--> statement-breakpoint
CREATE TABLE "snippets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" "snippet_category" DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "text" || ' ' || COALESCE("notes", ''))) STORED;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "tag_search_vector" "tsvector" DEFAULT ''::tsvector NOT NULL;--> statement-breakpoint
ALTER TABLE "snippets" ADD CONSTRAINT "snippets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "snippets_user_lower_name_unq" ON "snippets" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "snippets_user_idx" ON "snippets" USING btree ("user_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION refresh_post_tag_vector(p_post_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE posts
  SET tag_search_vector = COALESCE(
    (SELECT to_tsvector('english', string_agg(t.name, ' '))
     FROM post_tags pt
     JOIN tags t ON t.id = pt.tag_id
     WHERE pt.post_id = p_post_id),
    ''::tsvector
  )
  WHERE id = p_post_id;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION post_tags_refresh_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_post_tag_vector(OLD.post_id);
    RETURN OLD;
  ELSE
    PERFORM refresh_post_tag_vector(NEW.post_id);
    RETURN NEW;
  END IF;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS post_tags_after_change ON post_tags;--> statement-breakpoint
CREATE TRIGGER post_tags_after_change
AFTER INSERT OR DELETE ON post_tags
FOR EACH ROW EXECUTE FUNCTION post_tags_refresh_vector();--> statement-breakpoint
UPDATE posts SET tag_search_vector = COALESCE(
  (SELECT to_tsvector('english', string_agg(t.name, ' '))
   FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
   WHERE pt.post_id = posts.id),
  ''::tsvector
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS posts_fts_idx ON posts
  USING gin ((search_vector || tag_search_vector));
