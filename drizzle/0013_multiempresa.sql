CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"api_key_hash" text,
	"api_key_prefix" text,
	"webhook_url" text,
	"webhook_secret" text,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"price_pix_cents" integer NOT NULL,
	"price_card_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Multiempresa (2026-10-12). Migration aditiva: cria companies/products, semeia o AquaBlast como empresa
-- padrao ANTES dos FKs e liga as tabelas existentes a ela pelo default de company_id. Nada e apagado.
INSERT INTO "companies" ("id", "slug", "name", "active") VALUES ('00000000-0000-4000-8000-000000000001', 'aquablast', 'AquaBlast', true) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- Produtos do AquaBlast com os precos atuais de checkout.prices (cai nos valores padrao se o setting nao existir).
INSERT INTO "products" ("company_id", "slug", "sku", "name", "price_pix_cents", "price_card_cents", "position")
SELECT '00000000-0000-4000-8000-000000000001', p.slug, p.sku, p.name,
  COALESCE((SELECT (s.value -> p.pack ->> 'pix')::integer FROM "settings" s WHERE s.key = 'checkout.prices' AND s.encrypted = false), p.pix),
  COALESCE((SELECT (s.value -> p.pack ->> 'card')::integer FROM "settings" s WHERE s.key = 'checkout.prices' AND s.encrypted = false), p.card),
  p.pos
FROM (VALUES
  ('unit-azul', 'AQB-1UN-AZUL', '1 unidade AquaBlast - Azul', 'unit', 14971, 17971, 0),
  ('unit-vermelho', 'AQB-1UN-VERMELHO', '1 unidade AquaBlast - Vermelho', 'unit', 14971, 17971, 1),
  ('unit-preto', 'AQB-1UN-PRETO', '1 unidade AquaBlast - Preto', 'unit', 14971, 17971, 2),
  ('kit', NULL, 'Kit com 2 AquaBlast', 'kit', 23990, 26990, 3)
) AS p(slug, sku, name, pack, pix, card, pos)
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP INDEX IF EXISTS "checkout_banners_product_device_idx";--> statement-breakpoint
ALTER TABLE "checkout_banners" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_carts" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_carts" ADD COLUMN "items" jsonb;--> statement-breakpoint
ALTER TABLE "checkout_reviews" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_idx" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_api_key_hash_idx" ON "companies" USING btree ("api_key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "products_company_slug_idx" ON "products" USING btree ("company_id","slug");--> statement-breakpoint
CREATE INDEX "products_company_position_idx" ON "products" USING btree ("company_id","position");--> statement-breakpoint
ALTER TABLE "checkout_banners" ADD CONSTRAINT "checkout_banners_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_carts" ADD CONSTRAINT "checkout_carts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_reviews" ADD CONSTRAINT "checkout_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_banners_company_product_device_idx" ON "checkout_banners" USING btree ("company_id","product","device");--> statement-breakpoint
CREATE INDEX "checkout_carts_company_idx" ON "checkout_carts" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "checkout_reviews_company_idx" ON "checkout_reviews" USING btree ("company_id","position");--> statement-breakpoint
CREATE INDEX "orders_company_created_idx" ON "orders" USING btree ("company_id","created_at");