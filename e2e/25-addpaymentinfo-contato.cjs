/* eslint-disable @typescript-eslint/no-require-imports */
// 25 - AddPaymentInfo (Meta CAPI) assim que o carrinho tem e-mail OU celular, mesmo sem enviar o formulario
// (pedido do dono 2026-09-30: "pelo menos se ele preencheu o email ou telefone e abandonou").
// Alvo: dev em http://localhost:3100 + banco local. Pre-requisito: `node e2e/_setup.cjs on` (Meta ligada SEM pixelId:
// nada vai a Meta real; a linha fica em conversion_events com status "error").
// Rodar: NODE_PATH="$(npm root -g)" node e2e/25-addpaymentinfo-contato.cjs
//
// Cenarios:
//  25a. So e-mail valido + sair do campo: carrinho nasce com o e-mail e grava AddPaymentInfo api-<token>.
//  25b. So celular valido + sair do campo: idem, com o celular.
//  25c. E-mail invalido + sair do campo: nao cria carrinho nem evento.
//  25d. Celular com foco + CONTINUAR (blur e envio juntos): 1 carrinho so e 1 AddPaymentInfo so.
const L = require("./_lib.cjs");
const { assert, withDb, field, cliente } = L;

async function apiRows(token) {
  const r = await withDb((c) => c.query("select event_id, status from conversion_events where destination = 'meta' and event_name = 'AddPaymentInfo' and event_id = $1", [`api-${token}`]));
  return r.rows;
}

async function waitToken(page, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = await L.cartTokenOf(page);
    if (t) return t;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function waitApi(token, ms = 15000) {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) {
    rows = await apiRows(token);
    if (rows.length) return rows;
    await new Promise((r) => setTimeout(r, 500));
  }
  return rows;
}

const cartOf = (token) => withDb((c) => c.query("select customer_email, customer_phone, step from checkout_carts where token = $1", [token])).then((r) => r.rows[0]);

async function withPage(fn) {
  const { browser, page, pageErrors } = await L.open({ width: 360, height: 780, mobile: true, consent: "accepted" });
  try {
    await L.goCheckout(page);
    const out = await fn(page);
    assert.deepEqual(pageErrors, [], `erros na pagina: ${pageErrors.join(" | ")}`);
    return out;
  } finally {
    await browser.close();
  }
}

(async () => {
  await L.clearRateLimits();
  const results = [];
  results.push(
    await L.scenario("25a", "So e-mail + blur: carrinho com e-mail e AddPaymentInfo", () =>
      withPage(async (page) => {
        const email = `lead-${Date.now()}@teste.test`;
        await field(page, "email").fill(email);
        await field(page, "email").blur();
        const token = await waitToken(page);
        assert.ok(token, "carrinho nao nasceu");
        const cart = await cartOf(token);
        assert.equal(cart.customer_email, email);
        assert.equal(cart.customer_phone, null);
        const rows = await waitApi(token);
        assert.equal(rows.length, 1, "sem AddPaymentInfo");
        return `api-${token.slice(0, 6)}... (${rows[0].status})`;
      }),
    ),
  );
  results.push(
    await L.scenario("25b", "So celular + blur: carrinho com celular e AddPaymentInfo", () =>
      withPage(async (page) => {
        await field(page, "phone").fill(cliente.phone);
        await field(page, "phone").blur();
        const token = await waitToken(page);
        assert.ok(token, "carrinho nao nasceu");
        const cart = await cartOf(token);
        assert.equal(cart.customer_phone, cliente.phone);
        assert.equal(cart.customer_email, null);
        const rows = await waitApi(token);
        assert.equal(rows.length, 1, "sem AddPaymentInfo");
        return `api-${token.slice(0, 6)}... (${rows[0].status})`;
      }),
    ),
  );
  results.push(
    await L.scenario("25c", "E-mail invalido + blur: nada gravado", () =>
      withPage(async (page) => {
        await field(page, "email").fill("maria@");
        await field(page, "email").blur();
        await new Promise((r) => setTimeout(r, 3000));
        assert.equal(await L.cartTokenOf(page), null, "criou carrinho com e-mail invalido");
        return "sem carrinho";
      }),
    ),
  );
  results.push(
    await L.scenario("25d", "Foco no celular + CONTINUAR: 1 carrinho e 1 evento", () =>
      withPage(async (page) => {
        const email = `lead2-${Date.now()}@teste.test`;
        await field(page, "name").fill(cliente.name);
        await field(page, "email").fill(email);
        await field(page, "cpf").fill(cliente.cpf);
        await field(page, "phone").fill(cliente.phone);
        await L.submitDados(page); // o clique tira o foco do celular: blur e envio saem juntos
        const token = await waitToken(page);
        await new Promise((r) => setTimeout(r, 3000));
        const carts = await withDb((c) => c.query("select token, step from checkout_carts where customer_email = $1", [email]));
        assert.equal(carts.rowCount, 1, `carrinhos=${carts.rowCount}`);
        assert.equal(carts.rows[0].token, token);
        assert.equal(carts.rows[0].step, "entrega");
        const rows = await waitApi(token);
        assert.equal(rows.length, 1, "sem AddPaymentInfo");
        return `1 carrinho (${carts.rows[0].step}), 1 evento`;
      }),
    ),
  );
  await L.clearRateLimits();
  const bad = results.filter((r) => !r).length;
  process.stdout.write(bad ? `\n${bad} cenario(s) falharam\n` : "\nTodos os cenarios passaram\n");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`erro: ${String(e && e.message ? e.message : e).slice(0, 400)}\n`);
  process.exit(1);
});
