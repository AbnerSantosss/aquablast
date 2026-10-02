CREATE TABLE "buy_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"pack" text NOT NULL,
	"colors" text NOT NULL,
	"complete" boolean NOT NULL,
	"warned_only" boolean DEFAULT false NOT NULL,
	"place" text NOT NULL,
	"device" text NOT NULL,
	"utm_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "buy_clicks_event_idx" ON "buy_clicks" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "buy_clicks_created_idx" ON "buy_clicks" USING btree ("created_at");