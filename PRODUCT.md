# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Comprador.** Pais e avós, com peso igual entre dois motivos de compra (confirmado pelo dono em 2026-09-29):

- **Presente:** para filho, neto ou sobrinho, em datas como Dia das Crianças e Natal.
- **Brincar em família:** verão, quintal e piscina, com as crianças.

O tráfego vem de anúncios no Meta (Facebook/Instagram) e de busca. O celular é tratado como o aparelho principal do comprador (a LP, o checkout e os cards de oferta são desenhados primeiro para ele), mas isso ainda não foi medido com dados de acesso.

**Operador.** O dono, sozinho, opera tudo pelo painel `/admin` no computador: pedidos, envio e rastreio, gateways de pagamento, cupons, pixels e eventos, e-mails, produtos e preços. Não há equipe nem outro nível de acesso no dia a dia.

## Product Purpose

Vender o AquaBlast, um brinquedo lançador de água elétrico, direto ao consumidor, e acompanhar cada pedido do pagamento até a entrega sem que o cliente precise perguntar onde está a compra.

Sucesso é:

- venda paga (Pix ou cartão) no checkout próprio;
- pedido que se explica sozinho depois do pagamento (página de pedido pago, e-mail de confirmação com código de acesso, rastreio no site);
- dono conseguindo operar a loja inteira sozinho, pelo painel.

## Positioning

O que o AquaBlast pode dizer com verdade e um vendedor comum de marketplace não pode (confirmado pelo dono em 2026-09-29):

1. **Rastreio no próprio site.** Página `/rastrear` com o código e atualizações ao vivo, e e-mail de confirmação com código de acesso.
2. **Pix mais barato no checkout próprio.** Desconto no Pix em relação ao cartão, com parcelamento no cartão.
3. **Kit com 2 para brincar juntos.** Dois lançadores com as cores escolhidas pelo cliente e economia em relação a duas unidades.

A política "chegou quebrado, enviamos outro sem custo" existe e é publicada em `/trocas-e-devolucoes`, mas não foi escolhida como diferencial de posicionamento.

## Operating Context

- **Loja contínua de um produto só.** O produto fica, as campanhas trocam: Dia das Crianças (até 12/10), depois Natal e verão. Texto e imagem de campanha precisam ser trocáveis sem mexer na estrutura da página.
- **Anúncio no Meta.** A revisão do Meta lê a página de destino. O produto é sempre "brinquedo lançador de água" ou "brinquedo de água elétrico". Nunca usar "pistola", "mira" ou "arma".
- **Pagamento.** Checkout próprio com gateways configuráveis no painel (Pix e cartão), cupom e postback. Existe um checkout alternativo externo (Zedy) que o painel pode ligar.
- **Pós-venda.** Webhook ou postback marca o pedido como pago. O e-mail sai pelo SMTP configurado e o rastreio vem de uma API externa. O cliente acompanha em `/rastrear`.
- **Operação do painel.** Feita no computador. Cada tela do painel cabe na altura da janela (1366x768 e 1440x900), e só tabelas e colunas rolam por dentro.
- **Publicação.** O deploy passa pelo GitHub Actions e pelo Portainer, sempre com ok do dono.

## Capabilities and Constraints

- **Escopo de mudança (regra do dono, 2026-09-29):**
  - **LP (home e páginas públicas):** imagens, textos, copy e conteúdo **não se alteram**. O trabalho permitido é de responsividade: tamanho de texto por dispositivo, encaixe e espaçamento nas larguras e alturas de tela, e quebra de linha. Qualquer outra mudança na LP só com pedido explícito do dono.
  - **Painel `/admin`:** autorização total. Pode-se rever e alterar layout, fluxo, textos de interface e componentes do que for preciso.

- Stack existente: Next.js 16 (App Router), Postgres + Drizzle, Docker. O repositório é **público**, então nada sensível vai para o código ou para a documentação versionada.
- Rotas públicas: home (LP), `/checkout`, página do pedido, `/rastrear`, `/trocas-e-devolucoes`, `/politica-de-privacidade`, `/termos-de-uso`, `/llms.txt`.
- Painel `/admin`: pedidos, carrinhos, clientes, e-mails, webhooks, templates, produtos, gateways, pixels, personalizar checkout, configurações.
- **Preços e parcelamento não moram neste arquivo.** A fonte é o painel (Produtos) e os preços mudam. Qualquer valor na tela vem de lá.
- Escolha guiada: o cliente escolhe a cor (e as duas cores no kit) antes de comprar. O botão Comprar nunca trava; ele guia até a escolha.
- Pixel Meta e GA4 são enviados pelo navegador e pelo servidor. O código de evento de teste salvo no painel só vai junto nos eventos reais com a caixa "Enviar como evento de teste" marcada (ads.meta.testMode, com aviso vermelho enquanto ligada); desmarcada, o código fica guardado e as compras vão para os relatórios. O "Testar envio" usa o código sempre. Em Pixels, a Meta recebe pelo servidor só os eventos marcados (InitiateCheckout, AddPaymentInfo, Purchase): se o gateway já manda a compra para a Meta, Purchase fica desmarcado para não contar duas vezes.

## Brand Commitments

- Nome **AquaBlast**. Domínio `aquablastbrasil.com.br`. E-mail público `contato.aquablastbr@gmail.com`; o antigo `contato@aquablast.com.br` não volta.
- Idioma: português do Brasil, com tom caloroso de família e presente, direto, sem exagero.
- A paleta existente é fixa: os HEX não mudam (registro na wiki do projeto, `design/tokens-cores.md`).

## Evidence on Hand

- **66 avaliações de clientes reais**, confirmadas pelo dono em 2026-09-26. A nota e o total exibidos (e o `aggregateRating` do JSON-LD) são calculados delas. Uma avaliação nova sem origem confirmada desliga o `aggregateRating`.
- **Fotos oficiais do produto** nas 3 cores, e vídeos em `public/videos/`.
- **Fotos de campanha geradas por IA:** são ilustrativas. Nunca apresentar como cliente, depoimento ou prova.
- **Ausências que não se inventam:** idade recomendada, autonomia de bateria, alcance, capacidade do reservatório, materiais, prazo de entrega, "mais vendido" (não há dado de vendas), estoque limitado, prazos internos de reembolso e endereço de devolução.

## Product Principles

1. **Honestidade vence gatilho.** Só se afirma o que foi confirmado; o que falta fica fora, não é estimado.
2. **O cliente sabe o que escolheu.** Cor, quantidade e preço ficam sempre visíveis e coerentes do card ao checkout, e a compra é guiada, nunca travada.
3. **Depois de pagar, o pedido se explica sozinho.** Página do pedido, e-mail e rastreio respondem "onde está minha compra" sem WhatsApp.
4. **A campanha troca, a loja fica.** O que é sazonal é isolado e removível; a estrutura e a marca não dependem da data.
5. **Painel para uma pessoa só.** Tudo cabe na tela, ações arriscadas são explícitas e segredos são protegidos do preenchimento automático e da exposição.


## Autorização de campanha — 2026-10-05

O dono autorizou executar PLANO-VIRADA-VERAO.md e PROMPT-CLI-VIRADA-VERAO.md. A restrição de copy/imagens de 29/09 fica suspensa somente para esta virada de verão. Preços, paleta, pagamentos e eventos permanecem preservados. Sem push/deploy; revisão local. Registro: wiki/pedidos/2026-10-05-virada-verao.md.
