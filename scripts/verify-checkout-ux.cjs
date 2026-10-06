/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Checkout contracts, without a browser, HTTP, database, gateway or .env.
 * Run: node scripts/verify-checkout-ux.cjs
 *
 * Executes the actual TS/TSX modules with TypeScript's installed compiler.
 * Settings are an in-memory fixture built from the defaults' literal AST nodes;
 * the settings module itself is never imported. next/image is replaced with an
 * ordinary <img> for React server rendering. This does not validate mobile CSS,
 * browser interactions, live prices or a real payment.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "src");
const allowedSources = new Set([
  "lib/site/constants.ts",
  "lib/checkout/own/catalog.ts",
  "lib/checkout/own/schemas.ts",
  "lib/checkout/own/pricing.ts",
  "lib/checkout/own/address-form.ts",
  "lib/checkout/own/masks.ts",
  "lib/crypto.ts",
  "components/checkout/OrderSummary.tsx",
  "components/checkout/PixLogo.tsx",
  "components/checkout/CouponField.tsx",
]);
const allowedPackages = new Set(["zod", "react", "react/jsx-runtime", "lucide-react", "node:crypto"]);
const moduleCache = new Map();
const settingsOverrides = new Map();
const tests = [];

function compile(source, filename) {
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  }));
  return result.outputText;
}

// Evaluate only literal setting initializers, not the module's imports/functions.
function defaultFixture() {
  const filename = path.join(sourceRoot, "lib/settings.ts");
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
  let defaults;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "DEFAULTS") defaults = declaration.initializer;
    }
  }
  assert.ok(defaults && ts.isObjectLiteralExpression(defaults), "settings.ts must export literal DEFAULTS");
  const required = new Set(["checkout.prices", "checkout.maxInstallments", "checkout.testCoupon"]);
  const properties = defaults.properties.filter((property) =>
    ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name) && required.has(property.name.text));
  assert.equal(properties.length, required.size, "all price fixture defaults must exist");
  function literalOnly(node) {
    if (ts.isPropertyAssignment(node)) {
      assert.ok(ts.isStringLiteral(node.name) || ts.isIdentifier(node.name), "a fixture key cannot execute code");
      literalOnly(node.initializer);
      return;
    }
    assert.ok(
      ts.isObjectLiteralExpression(node) || ts.isStringLiteral(node) ||
      ts.isNumericLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword,
      "a settings fixture must contain only literal values",
    );
    ts.forEachChild(node, literalOnly);
  }
  properties.forEach(literalOnly);
  return vm.runInNewContext(`({${properties.map((property) => property.getText(source)).join(",")}})`, {}, { timeout: 1000 });
}

const defaults = defaultFixture();
const settingFixture = {
  async getSetting(key) {
    assert.ok(Object.hasOwn(defaults, key), `unexpected setting read: ${key}`);
    return JSON.parse(JSON.stringify(settingsOverrides.has(key) ? settingsOverrides.get(key) : defaults[key]));
  },
};

function sourceModule(filename) {
  const resolved = path.resolve(filename);
  const relative = path.relative(sourceRoot, resolved).replaceAll(path.sep, "/");
  assert.ok(allowedSources.has(relative), `source import blocked: ${relative}`);
  if (moduleCache.has(resolved)) return moduleCache.get(resolved).exports;
  const record = { exports: {} };
  moduleCache.set(resolved, record);
  function isolatedRequire(request) {
    if (request === "@/lib/settings") return settingFixture;
    if (request === "./env" || request === "@/lib/env") {
      return { env: () => { throw new Error("environment access is forbidden in this check"); } };
    }
    if (request === "next/image") {
      return function StaticImage({ src, alt, width, height, className }) {
        return React.createElement("img", { src, alt, width, height, className });
      };
    }
    if (allowedPackages.has(request)) return require(request);
    const base = request.startsWith("@/") ? path.join(sourceRoot, request.slice(2)) :
      request.startsWith(".") ? path.resolve(path.dirname(resolved), request) : null;
    assert.ok(base, `package import blocked: ${request}`);
    const target = [base, `${base}.ts`, `${base}.tsx`].find((candidate) =>
      fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    assert.ok(target, `source import not found: ${request}`);
    return sourceModule(target);
  }
  const context = vm.createContext({ module: record, exports: record.exports, require: isolatedRequire, Buffer });
  new vm.Script(compile(fs.readFileSync(resolved, "utf8"), resolved), { filename: resolved }).runInContext(context, { timeout: 1000 });
  return record.exports;
}

const fromSource = (relative) => sourceModule(path.join(sourceRoot, relative));
const constants = fromSource("lib/site/constants.ts");
const catalog = fromSource("lib/checkout/own/catalog.ts");
const schemas = fromSource("lib/checkout/own/schemas.ts");
const pricing = fromSource("lib/checkout/own/pricing.ts");
const address = fromSource("lib/checkout/own/address-form.ts");
const { OrderSummary, effectiveSelectionClient } = fromSource("components/checkout/OrderSummary.tsx");
const { money } = fromSource("lib/checkout/own/masks.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const cleanMoney = (value) => value.replace(/\s+/g, " ");
const test = (name, check) => tests.push([name, check]);
const colors = [...constants.COLOR_KEYS];
const prices = defaults["checkout.prices"];

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w-]+)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

function summary(props) {
  return renderToStaticMarkup(React.createElement(OrderSummary, {
    bump: false,
    cardEnabled: true,
    pixEnabled: true,
    payView: "preview",
    ...props,
  }));
}

function finalTotal(html) {
  const match = /<div class="ck-final-total">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(match, "summary must show a semantic final total row");
  return text(match[1]);
}

function checkDelivery(html) {
  const pairs = [...html.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)];
  const delivery = pairs.find((pair) => text(pair[1]) === "Entrega");
  assert.ok(delivery, "delivery cost must be part of the summary");
  assert.equal(text(delivery[2]), "Grátis");
}

for (const color of colors) {
  test(`LP URL → checkout: unit ${color}`, () => {
    const url = new URL(constants.ownCheckoutPath("unit", color, ["azul", "preto"]), "https://local.invalid");
    assert.equal(url.pathname, "/checkout");
    const selection = catalog.selectionFromParams(Object.fromEntries(url.searchParams));
    assert.deepEqual(plain(selection), { pack: "unit", colors: [color] });
    assert.equal(catalog.skuOf(selection), `AQB-1UN-${color.toUpperCase()}`);
    assert.equal(catalog.variantOf(selection), constants.COLOR_LABELS[color]);
  });
  for (const second of colors) {
    test(`LP URL → checkout: kit ${color} + ${second}`, () => {
      const url = new URL(constants.ownCheckoutPath("kit", color, [color, second]), "https://local.invalid");
      const selection = catalog.selectionFromParams(Object.fromEntries(url.searchParams));
      assert.deepEqual(plain(selection), { pack: "kit", colors: [color, second] });
      assert.equal(catalog.skuOf(selection), `AQB-KIT-${color.toUpperCase()}-${second.toUpperCase()}`);
      assert.equal(catalog.variantOf(selection), `${constants.COLOR_LABELS[color]} + ${constants.COLOR_LABELS[second]}`);
      const item = catalog.orderItemOf(selection, prices.kit.pix);
      assert.equal(item.quantity, 1, "kit is one bundled order item");
      assert.equal(item.unitPrice, 249.9);
    });
  }
}

test("URL fallback and repeated parameters are deterministic", () => {
  assert.deepEqual(plain(catalog.selectionFromParams({ cor: "invalid" })), { pack: "unit", colors: ["azul"] });
  assert.deepEqual(plain(catalog.selectionFromParams({ pack: "kit", cor1: "invalid" })), { pack: "kit", colors: ["azul", "preto"] });
  assert.deepEqual(plain(catalog.selectionFromParams({ pack: ["kit", "unit"], cor1: ["vermelho", "azul"], cor2: "preto" })), { pack: "kit", colors: ["vermelho", "preto"] });
});

test("selection schema enforces quantity and permits two equal colors", () => {
  assert.equal(schemas.selectionSchema.safeParse({ pack: "kit", colors: ["azul", "azul"] }).success, true);
  for (const selection of [
    { pack: "unit", colors: ["azul", "preto"] },
    { pack: "kit", colors: ["azul"] },
    { pack: "kit", colors: ["azul", "verde"] },
  ]) assert.equal(schemas.selectionSchema.safeParse(selection).success, false);
});

test("cart and payment schemas refuse client-controlled money", () => {
  const cart = { selection: { pack: "unit", colors: ["azul"] }, step: "dados" };
  const payment = { cartToken: "isolated-test-token", method: "pix" };
  assert.equal(schemas.cartSchema.safeParse(cart).success, true);
  assert.equal(schemas.paySchema.safeParse(payment).success, true);
  for (const key of ["amount", "amountCents", "total", "price"]) {
    assert.equal(schemas.cartSchema.safeParse({ ...cart, [key]: 1 }).success, false, `cart must reject ${key}`);
    assert.equal(schemas.paySchema.safeParse({ ...payment, [key]: 1 }).success, false, `payment must reject ${key}`);
  }
  for (const installments of [0, 13, 1.5]) {
    assert.equal(schemas.paySchema.safeParse({ ...payment, method: "card", installments }).success, false);
  }
});

test("LP prices agree with the actual checkout defaults", () => {
  assert.deepEqual(plain(prices), { unit: { pix: 15990, card: 17990 }, kit: { pix: 24990, card: 27990 } });
  for (const pack of ["unit", "kit"]) {
    assert.equal(Math.round(constants.PRICES[pack].amount * 100), prices[pack].pix);
    assert.equal(cleanMoney(constants.PRICES[pack].pix), cleanMoney(money(prices[pack].pix)));
    assert.equal(cleanMoney(constants.PRICES[pack].card), cleanMoney(money(prices[pack].card)));
  }
});

for (const method of ["pix", "card"]) {
  test(`server quote and bump preserve ${method} prices`, async () => {
    const unit = await pricing.quote("unit", method, false, 12);
    const kit = await pricing.quote("kit", method, false, 12);
    const bumped = await pricing.quote("unit", method, true, 12);
    assert.equal(unit.amountCents, method === "pix" ? 15990 : 17990);
    assert.equal(kit.amountCents, method === "pix" ? 24990 : 27990);
    assert.deepEqual(plain(bumped), plain(kit));
    assert.equal(unit.bumpDeltaCents, method === "pix" ? 9000 : 10000);
    assert.equal(unit.bumpSavingCents, method === "pix" ? 6990 : 7990);
    assert.equal(kit.installments, method === "pix" ? 1 : 12);
    assert.equal(kit.installmentCents, method === "pix" ? 24990 : 2333);
  });
}

test("server installment limits and rounding", async () => {
  for (const [requested, expected] of [[-3, 1], [99, 12], [8.9, 8]]) {
    assert.equal((await pricing.quote("kit", "card", false, requested)).installments, expected);
  }
  assert.equal((await pricing.quote("unit", "card", false, 12)).installmentCents, 1499);
  settingsOverrides.set("checkout.maxInstallments", 3);
  try {
    assert.equal((await pricing.quote("kit", "card", false, 12)).installments, 3);
    assert.equal((await pricing.quote("kit", "pix", false, 12)).installments, 1);
  } finally { settingsOverrides.clear(); }
  settingsOverrides.set("checkout.maxInstallments", 0);
  try { assert.equal((await pricing.quote("unit", "card", false, 12)).installments, 1); }
  finally { settingsOverrides.clear(); }
});

test("coupon is normalized, server controlled and only discounts Pix", async () => {
  assert.equal(pricing.normalizeCoupon("  teste  "), "TESTE");
  assert.equal((await pricing.quote("unit", "pix", false, 1, "TESTE")).couponDiscountCents, 0);
  settingsOverrides.set("checkout.testCoupon", { enabled: true, code: "TESTE", pixCents: 500 });
  try {
    const quoted = await pricing.quoteBoth("unit", true, 12, "  teste  ");
    assert.equal(quoted.pix.amountCents, 500);
    assert.equal(quoted.pix.couponDiscountCents, 24490);
    assert.equal(quoted.card.amountCents, 27990);
    assert.equal(quoted.card.couponDiscountCents, 0);
    assert.equal((await pricing.quote("unit", "pix", false, 1, "OTHER")).amountCents, 15990);
    assert.equal((await pricing.quote("unit", "card", false, 12, "TESTE")).amountCents, 17990);
    settingsOverrides.set("checkout.testCoupon", { enabled: true, code: "TESTE", pixCents: 99999 });
    assert.equal((await pricing.quote("unit", "pix", false, 1, "TESTE")).amountCents, 15990, "a coupon cannot increase the total");
  } finally { settingsOverrides.clear(); }
});

const oldAddress = {
  name: "Cliente de teste", email: "checkout@example.invalid", phone: "(11) 99999-9999", cpf: "",
  cep: "01001-000", street: "Praça da Sé", number: "100", extra: "Apto 2", district: "Sé", city: "São Paulo", state: "SP", recipient: "Destinatário de teste",
};

test("new CEP clears all previous address fields and keeps the recipient/contact", () => {
  const changed = address.changeAddressCep(oldAddress, "58400-000");
  assert.equal(changed.cep, "58400-000");
  for (const field of ["street", "number", "extra", "district", "city", "state"]) assert.equal(changed[field], "", field);
  for (const field of ["recipient", "name", "email", "phone", "cpf"]) assert.equal(changed[field], oldAddress[field], field);
  assert.equal(oldAddress.number, "100", "helper must not mutate its input");
});

test("same CEP with a different mask preserves address details", () => {
  const changed = address.changeAddressCep(oldAddress, "01001000");
  assert.deepEqual(plain(changed), { ...oldAddress, cep: "01001000" });
});

test("general/unavailable CEP fallback cannot inherit the former city or number", () => {
  const changed = address.changeAddressCep(oldAddress, "58400-000");
  const fallback = address.fillAddressFromCep(changed, { street: "", district: "", city: "", state: "" });
  for (const field of ["street", "number", "extra", "district", "city", "state"]) assert.equal(fallback[field], "", field);
  const partial = address.fillAddressFromCep(changed, { street: "", district: "", city: "Campina Grande", state: "PB" });
  assert.equal(partial.city, "Campina Grande");
  assert.equal(partial.state, "PB");
  assert.equal(partial.street, "");
  assert.equal(partial.number, "");
  assert.equal(partial.recipient, oldAddress.recipient);
});

test("summary disclosure is a semantic non-submit button with a valid target", async () => {
  const quotes = await pricing.quoteBoth("unit", false, 12);
  const html = summary({ selection: { pack: "unit", colors: ["azul"] }, quotes });
  const tag = /<button\b[^>]*class="ck-summary-toggle"[^>]*>/.exec(html);
  assert.ok(tag, "summary must expose a button");
  const attrs = attributes(tag[0]);
  assert.equal(attrs.type, "button");
  assert.equal(attrs["aria-expanded"], "false");
  assert.ok(attrs["aria-controls"]);
  assert.ok(html.includes(`id="${attrs["aria-controls"]}"`));
  assert.ok(text(html).includes(cleanMoney(money(quotes.pix.amountCents))));
  assert.ok(finalTotal(html).includes(cleanMoney(money(quotes.pix.amountCents))));
  checkDelivery(html);
});

for (const selectedColors of [["azul", "preto"], ["vermelho", "vermelho"]]) {
  test(`summary retains both kit colors: ${selectedColors.join(" + ")}`, async () => {
    const quotes = await pricing.quoteBoth("kit", false, 12);
    const html = summary({ selection: { pack: "kit", colors: selectedColors }, quotes });
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => attributes(match[0]));
    assert.equal(images.length, 2, "kit must render two separate product images");
    selectedColors.forEach((color, index) => {
      assert.equal(images[index].src, `/thumbs/produto-${color}-110.webp`);
      assert.match(images[index].alt, new RegExp(`^${index + 1}[ºª] AquaBlast ${constants.COLOR_LABELS[color].toLowerCase()}$`));
    });
    assert.ok(finalTotal(html).includes(cleanMoney(money(quotes.pix.amountCents))));
    checkDelivery(html);
  });
}

test("card summary displays the exact total as well as rounded installments", async () => {
  const quotes = await pricing.quoteBoth("kit", false, 12);
  const html = summary({ selection: { pack: "kit", colors: ["azul", "preto"] }, quotes, payView: "card" });
  assert.ok(finalTotal(html).includes(cleanMoney(money(27990))), "card total must not be inferred by multiplying rounded installments");
  assert.ok(text(html).includes(`12x de ${cleanMoney(money(2333))}`));
  checkDelivery(html);
});

test("pending bump includes its price and delivery without inventing a second color", async () => {
  const selection = { pack: "unit", colors: ["azul"] };
  assert.deepEqual(plain(effectiveSelectionClient(selection, true, null)), selection);
  const quotes = await pricing.quoteBoth("unit", true, 12);
  const html = summary({ selection, bump: true, bumpColor: null, quotes });
  const images = [...html.matchAll(/<img\b[^>]*>/g)];
  assert.equal(images.length, 1);
  const bumpRow = /<div class="bump-summary">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(bumpRow, "a pending bump must remain visible in the summary");
  assert.ok(text(bumpRow[1]).includes(cleanMoney(money(quotes.pix.bumpDeltaCents))));
  assert.ok(finalTotal(html).includes(cleanMoney(money(quotes.pix.amountCents))));
  checkDelivery(html);
});

test("confirmed bump renders the chosen second color rather than repeating the first", async () => {
  const selection = { pack: "unit", colors: ["azul"] };
  assert.deepEqual(plain(effectiveSelectionClient(selection, true, "vermelho")), { pack: "kit", colors: ["azul", "vermelho"] });
  const html = summary({ selection, bump: true, bumpColor: "vermelho", quotes: await pricing.quoteBoth("unit", true, 12) });
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => attributes(match[0]));
  assert.equal(images.length, 2);
  assert.equal(images[1].src, "/thumbs/produto-vermelho-110.webp");
  assert.match(images[1].alt, /^2[ºª] AquaBlast vermelho$/);
});

test("paid summary uses the paid amount, not the current quote", async () => {
  const html = summary({
    selection: { pack: "kit", colors: ["azul", "preto"] },
    quotes: await pricing.quoteBoth("kit", false, 12),
    payView: "pix",
    paid: { orderNumber: "ISOLATED", method: "card", amountCents: 27000, installments: 6, cardBrand: null, cardLast4: null, testMode: true },
  });
  assert.ok(finalTotal(html).includes(cleanMoney(money(27000))));
  assert.ok(text(html).includes(`6x de ${cleanMoney(money(4500))}`));
});

async function main() {
  let passed = 0;
  for (const [name, check] of tests) {
    try {
      await check();
      console.log(`PASS ${name}`);
      passed += 1;
    } catch (error) {
      console.error(`FAIL ${name}`);
      console.error(error instanceof Error ? error.stack : String(error));
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} isolated checkout checks passed.`);
  console.log("No browser, network, database, gateway or .env was used; mobile visual/payment QA remains separate.");
}

void main();
