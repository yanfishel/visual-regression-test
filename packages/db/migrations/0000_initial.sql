CREATE TYPE "public"."capture_failure_kind" AS ENUM('not-html', 'http-error', 'unreachable', 'timeout', 'selector-timeout', 'other');--> statement-breakpoint
CREATE TYPE "public"."comparison_status" AS ENUM('new', 'passed', 'failed', 'approved');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('manual', 'schedule', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."schedule_skip_reason" AS ENUM('run-in-progress', 'no-pages', 'quota-exceeded');--> statement-breakpoint
CREATE TYPE "public"."schedule_window" AS ENUM('night', 'day', 'any');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'pro', 'user');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"registration_open" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "baselines" (
	"project_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"viewport_id" uuid NOT NULL,
	"shot_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baselines_page_id_viewport_id_pk" PRIMARY KEY("page_id","viewport_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capture_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"viewport_id" uuid NOT NULL,
	"kind" "capture_failure_kind" NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shot_id" uuid NOT NULL,
	"baseline_shot_id" uuid,
	"diff_score" double precision,
	"height_delta" integer,
	"width_delta" integer,
	"region_report" jsonb,
	"status" "comparison_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"label" text NOT NULL,
	"wait_selector" text,
	"mask_selectors" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_schedules" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"runs_per_day" integer NOT NULL,
	"window" "schedule_window" DEFAULT 'night' NOT NULL,
	"time_zone" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_skipped_at" timestamp with time zone,
	"last_skip_reason" "schedule_skip_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"diff_threshold" double precision DEFAULT 0.01 NOT NULL,
	"favicon_key" text,
	"notify_on_failure" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_limits" (
	"role" "user_role" PRIMARY KEY NOT NULL,
	"max_projects" integer NOT NULL,
	"max_pages_per_project" integer NOT NULL,
	"max_automated_runs_per_day" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"trigger" "run_trigger" DEFAULT 'manual' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"viewport_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"regions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "viewports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"device_scale_factor" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "baselines" ADD CONSTRAINT "baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "baselines" ADD CONSTRAINT "baselines_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "baselines" ADD CONSTRAINT "baselines_viewport_id_viewports_id_fk" FOREIGN KEY ("viewport_id") REFERENCES "public"."viewports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "baselines" ADD CONSTRAINT "baselines_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capture_failures" ADD CONSTRAINT "capture_failures_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capture_failures" ADD CONSTRAINT "capture_failures_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capture_failures" ADD CONSTRAINT "capture_failures_viewport_id_viewports_id_fk" FOREIGN KEY ("viewport_id") REFERENCES "public"."viewports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_baseline_shot_id_shots_id_fk" FOREIGN KEY ("baseline_shot_id") REFERENCES "public"."shots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pages" ADD CONSTRAINT "pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_schedules" ADD CONSTRAINT "project_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shots" ADD CONSTRAINT "shots_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shots" ADD CONSTRAINT "shots_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shots" ADD CONSTRAINT "shots_viewport_id_viewports_id_fk" FOREIGN KEY ("viewport_id") REFERENCES "public"."viewports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viewports" ADD CONSTRAINT "viewports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "baselines_project_id_idx" ON "baselines" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_failures_run_id_idx" ON "capture_failures" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_failures_page_id_idx" ON "capture_failures" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_failures_viewport_id_idx" ON "capture_failures" USING btree ("viewport_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comparisons_shot_id_idx" ON "comparisons" USING btree ("shot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_schedules_due_idx" ON "project_schedules" USING btree ("next_run_at") WHERE paused = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_owner_id_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_project_id_created_at_idx" ON "runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shots_run_id_idx" ON "shots" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shots_page_id_idx" ON "shots" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shots_viewport_id_idx" ON "shots" USING btree ("viewport_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shots_storage_key_idx" ON "shots" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "viewports_project_id_width_idx" ON "viewports" USING btree ("project_id","width");--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_single_row" CHECK ("id" = 1);--> statement-breakpoint
INSERT INTO "users" ("id", "email", "role") VALUES ('00000000-0000-0000-0000-000000000001', 'local@vrt', 'admin');--> statement-breakpoint
INSERT INTO "role_limits" ("role", "max_projects", "max_pages_per_project", "max_automated_runs_per_day") VALUES ('user', 2, 4, 3), ('pro', 4, 6, 6);--> statement-breakpoint
INSERT INTO "app_settings" ("id", "registration_open") VALUES (1, true);
