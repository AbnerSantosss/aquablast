-- Pedido do dono (2026-09-30): o cartão passa a sair pela FastPay por padrão. Migration de DADOS, roda uma vez só.
-- Sem a chave da FastPay salva no painel, gatewayFor("card") devolve null e o checkout segue com o cartão "em breve".
INSERT INTO "settings" ("key", "value", "encrypted", "updated_at", "updated_by")
VALUES ('gateway.card', '"fastpay"'::jsonb, false, now(), 'migration 0004 (cartao pela FastPay)')
ON CONFLICT ("key") DO UPDATE SET "value" = '"fastpay"'::jsonb, "encrypted" = false, "updated_at" = now(), "updated_by" = 'migration 0004 (cartao pela FastPay)';
