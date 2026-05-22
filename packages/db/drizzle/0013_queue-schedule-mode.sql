ALTER TABLE "queues" ADD COLUMN "schedule_mode" varchar(16) DEFAULT 'fixed' NOT NULL;
--> statement-breakpoint

UPDATE "queues"
SET "schedule_mode" = 'variable'
WHERE "interval_type" = 'variable';
--> statement-breakpoint

UPDATE "queues"
SET "schedule_mode" = 'specific',
    "interval_type" = 'fixed'
WHERE "interval_type" = 'specific';
--> statement-breakpoint

ALTER TABLE "queues" ADD CONSTRAINT "queues_schedule_mode_interval_type_ck"
  CHECK (
    CASE
      WHEN "schedule_mode" IN ('specific', 'fixed') THEN "interval_type" = 'fixed'
      WHEN "schedule_mode" = 'variable' THEN "interval_type" = 'variable'
      ELSE FALSE
    END
  );
