CREATE TYPE "public"."cart_status" AS ENUM('open', 'abandoned', 'recovered', 'converted');--> statement-breakpoint
CREATE TYPE "public"."cart_step" AS ENUM('dados', 'entrega', 'pagamento', 'concluido');--> statement-breakpoint
CREATE TABLE "checkout_carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"status" "cart_status" DEFAULT 'open' NOT NULL,
	"step" "cart_step" DEFAULT 'dados' NOT NULL,
	"pack" text NOT NULL,
	"colors" jsonb NOT NULL,
	"bump_accepted" boolean DEFAULT false NOT NULL,
	"amount_cents" integer NOT NULL,
	"customer_name" text,
	"customer_email" text,
	"customer_phone" text,
	"customer_document_enc" text,
	"address_line1" text,
	"address_number" text,
	"address_line2" text,
	"address_neighborhood" text,
	"address_city" text,
	"address_state" text,
	"address_postal_code" text,
	"recipient" text,
	"utm" jsonb,
	"fbp" text,
	"fbc" text,
	"ga_client_id" text,
	"ga_session_id" text,
	"client_ip" text,
	"user_agent" text,
	"consent" boolean DEFAULT false NOT NULL,
	"order_id" uuid,
	"recovery_email_count" integer DEFAULT 0 NOT NULL,
	"last_recovery_email_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_carts_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"cart_id" uuid,
	"destination" text NOT NULL,
	"event_name" text NOT NULL,
	"event_id" text NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"cart_id" uuid,
	"provider" text NOT NULL,
	"method" text NOT NULL,
	"provider_transaction_id" text,
	"status" text NOT NULL,
	"status_reason" text,
	"amount_cents" integer NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"card_brand" text,
	"card_last4" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "cart_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cart_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "installments" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fbp" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fbc" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ga_client_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ga_session_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "client_ip" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_carts" ADD CONSTRAINT "checkout_carts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_cart_id_checkout_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."checkout_carts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_cart_id_checkout_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."checkout_carts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_carts_status_idx" ON "checkout_carts" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "checkout_carts_email_idx" ON "checkout_carts" USING btree ("customer_email");--> statement-breakpoint
CREATE UNIQUE INDEX "conversion_events_dedupe_idx" ON "conversion_events" USING btree ("destination","event_name","event_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_order_idx" ON "payment_attempts" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_tx_idx" ON "payment_attempts" USING btree ("provider","provider_transaction_id");