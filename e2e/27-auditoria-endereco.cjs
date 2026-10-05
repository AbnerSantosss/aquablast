/* eslint-disable @typescript-eslint/no-require-imports */
// Regressão local: editar endereço depois de gerar Pix deve atualizar o pedido pendente.
const assert = require('node:assert/strict');
const { withDb } = require('./_db.cjs');
const BASE = 'http://localhost:3100';
async function post(path, body) {
  const response = await fetch(BASE + path, {method:'POST', headers:{'content-type':'application/json',origin:BASE},body:JSON.stringify(body)});
  const data = await response.json();
  assert.ok(response.ok && data.ok, `${path}: ${response.status} ${data.error || ''}`);
  return data;
}
(async () => {
  const config = await (await fetch(BASE + '/api/checkout/config')).json();
  assert.equal(config.pix.gateway, 'simulado', 'Este teste só roda com Pix simulado.');
  const payload = {selection:{pack:'unit',colors:['vermelho']},bump:false,step:'pagamento',tracking:{consent:false},customer:{name:'Cliente Auditoria',email:`auditoria.${Date.now()}@example.test`,phone:'11999999999',cpf:'52998224725'},address:{cep:'01001000',street:'Praça da Sé',number:'100',district:'Sé',city:'São Paulo',state:'SP',recipient:'Cliente Auditoria'}};
  const cart = await post('/api/checkout/cart',payload);
  const pay = {cartToken:cart.token,method:'pix',installments:1,bump:false};
  const first = await post('/api/checkout/pay',pay);
  await post('/api/checkout/cart',{...payload,token:cart.token,address:{...payload.address,number:'200',extra:'Bloco teste',recipient:'Destinatario Auditoria'}});
  const saved = await withDb(async c => (await c.query('select address_number from checkout_carts where token=$1',[cart.token])).rows[0]);
  assert.equal(saved.address_number,'200','Carrinho deve salvar a correção antes de pagar.');
  const again = await post('/api/checkout/pay',pay);
  assert.equal(again.publicToken,first.publicToken,'Deve manter o mesmo pedido.');
  assert.equal(again.pix.code,first.pix.code,'Deve reutilizar o Pix válido sem nova cobrança.');
  const row = await withDb(async c => (await c.query('select address_line1,address_line2 from orders where public_token=$1',[again.publicToken])).rows[0]);
  assert.equal(row.address_line1,'Praça da Sé, 200','Pedido reteve o endereço anterior.');
  assert.equal(row.address_line2,'Bloco teste - A/C Destinatario Auditoria');
  console.log('PASS: Pix reutilizado com endereço e destinatário atualizados.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
