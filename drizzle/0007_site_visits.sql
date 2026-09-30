CREATE TABLE "site_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"path" text NOT NULL,
	"viewed_product" boolean DEFAULT false NOT NULL,
	"utm_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "site_visits_event_idx" ON "site_visits" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "site_visits_created_idx" ON "site_visits" USING btree ("created_at");