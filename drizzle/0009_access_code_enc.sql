-- Pedido do dono (2026-10-02): um código de rastreio por pedido, repetido em todos os e-mails. Para isso o texto
-- do código passa a ficar guardado cifrado (AES-GCM, mesma chave do CPF); o hash continua sendo o que a consulta usa.
-- Linhas antigas ficam NULL: o código AQB-... delas segue valendo até expirar, só não pode ser repetido em e-mail novo.
ALTER TABLE "order_access_codes" ADD COLUMN "code_enc" text;
