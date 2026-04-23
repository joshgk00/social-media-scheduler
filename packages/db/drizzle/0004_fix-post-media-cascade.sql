-- Fix: Change post_media.post_id FK from CASCADE to SET NULL.
-- With CASCADE, deleting a post immediately hard-deletes its media rows,
-- preventing the cleanup worker from ever seeing the soft-deleted rows
-- and leaving storage files as permanent orphans.
-- With SET NULL, post deletion nulls post_id but preserves deletedAt,
-- so the weekly cleanup worker finds and removes the storage files.

ALTER TABLE "post_media"
  DROP CONSTRAINT "post_media_post_id_posts_id_fk",
  ADD CONSTRAINT "post_media_post_id_posts_id_fk"
    FOREIGN KEY ("post_id") REFERENCES "posts"("id")
    ON DELETE SET NULL;
