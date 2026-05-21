DROP INDEX IF EXISTS "bulk_operations_idempotency_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "bulk_operations_user_idempotency_uniq" ON "bulk_operations" USING btree ("user_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;
