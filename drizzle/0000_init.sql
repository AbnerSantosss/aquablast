CREATE TYPE "public"."event_source" AS ENUM('checkout', 'tracking', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('created', 'approved', 'preparing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'refused', 'refunded', 'chargeback', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'ignored', 'unmapped', 'error', 'unauthorized');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"to" text NOT NULL,
	"template_key" text,
	"subject" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"message_id" text,
	"triggered_by" text DEFAULT 'system' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_access_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" "event_source" DEFAULT 'system' NOT NULL,
	"status" "order_status",
	"dedupe_key" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"external_id" text,
	"checkout_provider" text DEFAULT 'generic' NOT NULL,
	"status" "order_status" DEFAULT 'created' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"pix_code" text,
	"pix_qr_url" text,
	"pix_expires_at" timestamp with time zone,
	"payment_url" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"customer_name" text,
	"customer_email" text,
	"customer_phone" text,
	"customer_document_enc" text,
	"address_line1" text,
	"address_line2" text,
	"address_neighborhood" text,
	"address_city" text,
	"address_state" text,
	"address_postal_code" text,
	"address_country" text DEFAULT 'Brasil',
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amount_total" numeric(10, 2),
	"currency" text DEFAULT 'BRL' NOT NULL,
	"utm" jsonb,
	"tracking_code" text,
	"tracking_url" text,
	"carrier_name" text,
	"carrier_code" text,
	"tracking_provider" text,
	"tracking_registered_at" timestamp with time zone,
	"tracking_last_sync_at" timestamp with time zone,
	"tracking_last_status" text,
	"tracking_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"preparing_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"in_transit_at" timestamp with time zone,
	"out_for_delivery_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"admin_notes" text,
	"last_reminder_at" timestamp with time zone,
	"reminder_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"encrypted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"provider" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"body_hash" text NOT NULL,
	"headers" jsonb,
	"payload" jsonb,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"detail" text,
	"order_id" uuid,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_access_codes" ADD CONSTRAINT "order_access_codes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_log_order_idx" ON "email_log" USING btree ("order_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_access_codes_hash_idx" ON "order_access_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "order_access_codes_order_idx" ON "order_access_codes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_events_dedupe_idx" ON "order_events" USING btree ("order_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_external_id_idx" ON "orders" USING btree ("checkout_provider","external_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "orders_tracking_code_idx" ON "orders" USING btree ("tracking_code");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_hash_idx" ON "webhook_deliveries" USING btree ("source","body_hash");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_received_idx" ON "webhook_deliveries" USING btree ("received_at");