CREATE TABLE "checkout_review_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author" text NOT NULL,
	"score" integer NOT NULL,
	"comment" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkout_review_images" ADD CONSTRAINT "checkout_review_images_review_id_checkout_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."checkout_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_review_images_review_idx" ON "checkout_review_images" USING btree ("review_id","position");--> statement-breakpoint
CREATE INDEX "checkout_reviews_position_idx" ON "checkout_reviews" USING btree ("position");--> statement-breakpoint
-- Seed: os dois comentários que o checkout já mostrava (fixos em checkout-props.ts até 2026-10-11), com autor,
-- nota e texto exatamente como em src/data/reviews.ts (review-carlos e review-elcio). Sem foto: quem cadastra é o dono.
INSERT INTO "checkout_reviews" ("author", "score", "comment", "position", "active") VALUES
	('carlos.dutra', 5, 'Muito divertida, irei comprar mais', 1, true),
	('elciobach722', 5, 'Comprei pros meus filhos e elas amaram, brincaram bastante. produto muito bom para criança se divertir.', 2, true);
