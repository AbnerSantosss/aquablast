/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Checkout contracts, without a browser, HTTP, database, gateway or .env.
 * Run: node scripts/verify-checkout-ux.cjs
 *
 * Executes the actual TS/TSX modules with TypeScript's installed compiler.
 * Settings are an in-memory fixture built from the defaults' literal AST nodes;
 * the settings module itself is never imported. next/image is replaced with an
 * ordinary <img> for React server rendering. Allowed CSS modules are read as text
 * and replaced with inert class-name maps; their contents are never executed.
 * This does not validate mobile CSS,
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
  "lib/site/prices.ts",
  "lib/checkout/own/catalog.ts",
  "lib/checkout/own/schemas.ts",
  "lib/checkout/own/pricing.ts",
  "lib/checkout/own/shipping.ts",
  "lib/checkout/own/order-pricing.ts",
  "lib/checkout/own/address-form.ts",
  "lib/checkout/own/masks.ts",
  "lib/crypto.ts",
  "components/checkout/OrderSummary.tsx",
  "components/checkout/PixLogo.tsx",
  "components/checkout/CouponField.tsx",
]);
const allowedPackages = new Set(["zod", "react", "react/jsx-runtime", "lucide-react", "node:crypto"]);
const allowedStyles = new Set(["components/checkout/OrderSummary.module.css", "components/checkout/CouponField.module.css"]);
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
    if (request.endsWith(".module.css")) {
      const relativeStyle = path.relative(sourceRoot, base).replaceAll(path.sep, "/");
      assert.ok(allowedStyles.has(relativeStyle), `style import blocked: ${relativeStyle}`);
      const styleText = fs.readFileSync(base, "utf8");
      return Object.freeze(Object.fromEntries([...styleText.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => [match[1], `isolated-${match[1]}`])));
    }
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
const sitePrices = fromSource("lib/site/prices.ts");
const catalog = fromSource("lib/checkout/own/catalog.ts");
const schemas = fromSource("lib/checkout/own/schemas.ts");
const pricing = fromSource("lib/checkout/own/pricing.ts");
const shipping = fromSource("lib/checkout/own/shipping.ts");
const orderPricing = fromSource("lib/checkout/own/order-pricing.ts");
const address = fromSource("lib/checkout/own/address-form.ts");
const { OrderSummary, effectiveSelectionClient, summaryIsExpanded } = fromSource("components/checkout/OrderSummary.tsx");
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
  const pairs = [...html.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)];
  const total = pairs.find((pair) => /^Total (?:pago|no Pix|no cartão)$/.test(text(pair[1])));
  assert.ok(total, "summary must show a semantic final total row");
  return `${text(total[1])} ${text(total[2])}`;
}

function amountRow(html, label) {
  const pairs = [...html.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)];
  const row = pairs.find((pair) => text(pair[1]) === label);
  assert.ok(row, `summary must contain the ${label} row`);
  return text(row[2]).replace(/^− /, "- ");
}

function productRows(html) {
  return [...html.matchAll(/<li\b([^>]*data-summary-unit="\d+"[^>]*)>([\s\S]*?)<\/li>/g)].map((match) => ({ attrs: attributes(match[1]), html: match[2] }));
}

/** Photos of the product rows only. The collapsed bar has its own decorative thumbnail (2026-10-11), read by `summaryBar`. */
function productImages(html) {
  return productRows(html).flatMap((row) => [...row.html.matchAll(/<img\b[^>]*>/g)].map((match) => attributes(match[0])));
}

/** The summary disclosure button. Collapsed on mobile (the server render) it is the compact bar. */
function summaryBar(html) {
  const match = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((candidate) => attributes(candidate[1])["aria-controls"] === "checkout-summary-details");
  assert.ok(match, "summary must expose its disclosure button");
  return { attrs: attributes(match[1]), text: text(match[2]), images: [...match[2].matchAll(/<img\b[^>]*>/g)].map((image) => attributes(image[0])) };
}

/** The "Tenho um cupom" disclosure button and the opening tag of the panel it controls. */
function couponDisclosure(html) {
  const match = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((candidate) => text(candidate[2]) === "Tenho um cupom");
  assert.ok(match, "the coupon must start from the \"Tenho um cupom\" button");
  const attrs = attributes(match[1]);
  assert.equal(attrs.type, "button", "opening the coupon must not submit anything");
  assert.ok(attrs["aria-controls"] && attrs["aria-controls"] !== "checkout-summary-details", "the coupon button controls its own panel");
  const panel = new RegExp(`<div\\b[^>]*id="${attrs["aria-controls"]}"[^>]*>`).exec(html);
  assert.ok(panel, "aria-controls must point at the coupon panel");
  assert.ok(match.index < panel.index && panel.index < html.indexOf('id="checkout-coupon"'), "the coupon field lives inside the panel, after its button");
  return { attrs, panelHidden: /\shidden=""/.test(panel[0]) };
}

// Shipping is free on every order; FULL is an optional paid choice made in the delivery step.
// The open summary only has a shipping row after that step (`shippingChosen`) or once FULL was chosen:
// "Frete · Grátis" or "Frete FULL · R$ 9,99". A paid order shows what it recorded, under "Entrega".
const FREE_DELIVERY_ROW = "Frete Grátis";
const FULL_DELIVERY_ROW = `Frete FULL ${cleanMoney(money(999))}`;

/** "<label> <value>" of the shipping row, or null when the summary has none. */
function deliveryRow(html) {
  const pairs = [...html.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)];
  const delivery = pairs.find((pair) => /^(Frete|Frete FULL|Entrega)$/.test(text(pair[1])));
  return delivery ? `${text(delivery[1])} ${text(delivery[2])}` : null;
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
    test(`legacy catalog retains kit ${color} + ${second}`, () => {
      const url = new URL(constants.ownCheckoutPath("kit", color, [color, second]), "https://local.invalid");
      const selection = catalog.selectionFromParams(Object.fromEntries(url.searchParams));
      assert.deepEqual(plain(selection), { pack: "kit", colors: [color, second] });
      assert.equal(catalog.skuOf(selection), `AQB-KIT-${color.toUpperCase()}-${second.toUpperCase()}`);
      assert.equal(catalog.variantOf(selection), `${constants.COLOR_LABELS[color]} + ${constants.COLOR_LABELS[second]}`);
      const item = catalog.orderItemOf(selection, prices.kit.pix);
      assert.equal(item.quantity, 1, "kit is one bundled order item");
      assert.equal(item.unitPrice, 239.9);
    });
  }
}

test("URL fallback and repeated parameters are deterministic", () => {
  assert.deepEqual(plain(catalog.selectionFromParams({ cor: "invalid" })), { pack: "unit", colors: ["azul"] });
  assert.deepEqual(plain(catalog.selectionFromParams({ pack: "kit", cor1: "invalid" })), { pack: "kit", colors: ["azul", "preto"] });
  assert.deepEqual(plain(catalog.selectionFromParams({ pack: ["kit", "unit"], cor1: ["vermelho", "azul"], cor2: "preto" })), { pack: "kit", colors: ["vermelho", "preto"] });
});

async function newCheckoutPage(params) {
  const filename = path.join(sourceRoot, "app/(checkout)/checkout/page.tsx");
  const record = { exports: {} };
  const calls = [];
  const mocks = {
    "next/navigation": { redirect: () => { throw new Error("unexpected external checkout redirect"); } },
    "@/components/checkout/Checkout": { Checkout: function CheckoutFixture() {} },
    "@/lib/checkout/own/catalog": catalog,
    "@/lib/checkout/own/checkout-props": {
      loadCheckoutProps: async (...args) => {
        calls.push(args);
        return { mode: "proprio", props: {} };
      },
    },
    "@/lib/bootstrap": { ensureBootstrap: async () => {} },
    "@/lib/site/constants": constants,
    "@/lib/site/delivery-promise": { deliveryPromiseText: () => null },
    "react/jsx-runtime": require("react/jsx-runtime"),
  };
  const context = vm.createContext({
    module: record, exports: record.exports,
    require(request) {
      assert.ok(Object.hasOwn(mocks, request), `checkout entry import blocked: ${request}`);
      return mocks[request];
    },
  });
  new vm.Script(compile(fs.readFileSync(filename, "utf8"), filename), { filename }).runInContext(context, { timeout: 1000 });
  const result = await record.exports.default({ searchParams: Promise.resolve(params) });
  return { selection: plain(result.props.selection), calls: plain(calls) };
}

test("new checkout entry preserves the selected offer and never adds a bump", async () => {
  for (const params of [
    { pack: "kit", cor1: "vermelho", cor2: "preto" },
    { product: "kit", cor1: "vermelho", cor2: "azul" },
    { pack: ["kit", "unit"], cor1: ["vermelho", "azul"], cor2: "preto" },
  ]) {
    const entry = await newCheckoutPage({ ...params, cupom: ["TESTE", "IGNORAR"] });
    assert.deepEqual(entry.selection, { pack: "kit", colors: ["vermelho", params.cor2] });
    assert.deepEqual(entry.calls, [["kit", false, "TESTE"]], "a new entry must never opt into the bump");
  }
  assert.deepEqual((await newCheckoutPage({ pack: "unit", cor: "preto" })).selection, { pack: "unit", colors: ["preto"] });
  assert.deepEqual(plain(catalog.selectionFromCart({ pack: "kit", colors: ["vermelho", "preto"] })), { pack: "kit", colors: ["vermelho", "preto"] });
});

async function isolatedCartSave(initial) {
  const filename = path.join(sourceRoot, "components/checkout/Checkout.tsx");
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(["readTokenFromStorage", "writeTokenToStorage", "saveCartNow"]);
  const declarations = new Map();
  let tokenKey;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) declarations.set(node.name.text, node.getText(source));
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "TOKEN_KEY") tokenKey = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(declarations.size, names.size, "real checkout storage/save functions must be available");
  assert.ok(tokenKey);
  const storage = new Map([["ck-cart-token", "legacy-cart-token"]]);
  const sent = [];
  const context = vm.createContext({
    initial,
    window: { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
    selection: { pack: "unit", colors: ["azul"] },
    // Same initial value as the component state: useState(initial?.shipping ?? "free").
    shipping: initial?.shipping ?? "free",
    tokenRef: { current: initial?.cartToken }, cartToken: initial?.cartToken,
    quoteVersion: { current: 0 }, visitId: { current: "" }, bumpColor: null, coupon: "", data: {}, cpfMasked: null,
    buildTracking: () => ({ consent: false }),
    postCart: async (payload) => {
      sent.push(plain(payload));
      return { ok: true, token: initial?.cartToken ?? "new-offer-cart-token", quotes: {} };
    },
    isApiFail: (value) => value.ok === false,
    setCartToken: () => {}, setQuotes: () => {},
  });
  const code = `const ${tokenKey};\n${[...declarations.values()].join("\n")}\nglobalThis.saveActualCart = saveCartNow;`;
  new vm.Script(compile(code, filename), { filename }).runInContext(context, { timeout: 1000 });
  await context.saveActualCart("dados", false, { lead: { email: "checkout@example.invalid" } });
  return { storage, sent };
}

test("new checkout storage cannot reuse an old cart or inherit a recovered cart", async () => {
  const fresh = await isolatedCartSave(undefined);
  assert.equal(fresh.sent[0].token, undefined, "new entry must not send a legacy cart token");
  assert.equal(fresh.sent[0].shipping, "free", "a new entry must never opt into the paid FULL shipping");
  assert.equal(fresh.storage.get("ck-cart-token"), "legacy-cart-token");
  assert.equal(fresh.storage.get("ck-cart-token-unit-149"), "new-offer-cart-token");
  const recovered = await isolatedCartSave({ cartToken: "recovered-old-cart-token" });
  assert.equal(recovered.sent[0].token, "recovered-old-cart-token", "explicit recovery must keep its own token");
  assert.equal(recovered.storage.get("ck-cart-token"), "legacy-cart-token");
  assert.equal(recovered.storage.has("ck-cart-token-unit-149"), false, "recovery must not seed the new offer's token");
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
  for (const key of ["amount", "amountCents", "total", "price", "shippingCents", "productSubtotalCents"]) {
    assert.equal(schemas.cartSchema.safeParse({ ...cart, [key]: 1 }).success, false, `cart must reject ${key}`);
    assert.equal(schemas.paySchema.safeParse({ ...payment, [key]: 1 }).success, false, `payment must reject ${key}`);
  }
  for (const installments of [0, 13, 1.5]) {
    assert.equal(schemas.paySchema.safeParse({ ...payment, method: "card", installments }).success, false);
  }
});

test("LP prices agree with the actual checkout defaults", () => {
  assert.deepEqual(plain(prices), { unit: { pix: 14971, card: 17971 }, kit: { pix: 23990, card: 26990 } });
  // The LP reads the panel; its build-time fallback must be the same numbers as the settings defaults.
  assert.deepEqual(plain(sitePrices.FALLBACK_PRICE_CENTS), plain(prices));
  assert.equal(sitePrices.FALLBACK_MAX_INSTALLMENTS, defaults["checkout.maxInstallments"]);
  const lp = sitePrices.buildSitePrices(prices, defaults["checkout.maxInstallments"]);
  for (const pack of ["unit", "kit"]) {
    assert.equal(Math.round(lp[pack].amount * 100), prices[pack].pix);
    assert.equal(cleanMoney(lp[pack].pix), cleanMoney(money(prices[pack].pix)));
    assert.equal(cleanMoney(lp[pack].card), cleanMoney(money(prices[pack].card)));
  }
  assert.deepEqual(
    [lp.unit.installment, lp.kit.installment, lp.unit.pixDiscount, lp.kit.pixDiscount, lp.kitSaving, lp.installments],
    ["R$ 14,98", "R$ 22,49", "R$ 30", "R$ 30", "R$ 59,52", 12],
  );
});

for (const method of ["pix", "card"]) {
  test(`server quote and bump preserve ${method} prices`, async () => {
    const unit = await pricing.quote("unit", method, false, 12);
    const kit = await pricing.quote("kit", method, false, 12);
    const bumped = await pricing.quote("unit", method, true, 12);
    assert.equal(unit.productSubtotalCents, method === "pix" ? 14971 : 17971);
    assert.equal(unit.shippingMethod, "free", "without a choice the shipping is the free one");
    assert.equal(unit.shippingCents, 0);
    assert.equal(unit.amountCents, method === "pix" ? 14971 : 17971);
    assert.equal(kit.productSubtotalCents, method === "pix" ? 23990 : 26990);
    assert.equal(kit.shippingCents, 0);
    assert.equal(kit.amountCents, method === "pix" ? 23990 : 26990);
    assert.deepEqual(plain(bumped), plain(kit));
    assert.equal(unit.bumpDeltaCents, 9019);
    assert.equal(bumped.amountCents - unit.amountCents, 9019, "the second unit costs exactly its delta: shipping does not depend on the pack");
    assert.equal(unit.bumpSavingCents, method === "pix" ? 5952 : 8952);
    assert.equal(kit.installments, method === "pix" ? 1 : 12);
    assert.equal(kit.installmentCents, method === "pix" ? 23990 : 2249);
    const unitFull = await pricing.quote("unit", method, false, 12, undefined, "full");
    const bumpedFull = await pricing.quote("unit", method, true, 12, undefined, "full");
    assert.equal(unitFull.productSubtotalCents, unit.productSubtotalCents, "FULL never changes the product price");
    assert.equal(unitFull.amountCents, method === "pix" ? 15970 : 18970);
    assert.equal(bumpedFull.amountCents, method === "pix" ? 24989 : 27989);
    assert.equal(bumpedFull.amountCents - unitFull.amountCents, 9019, "the second unit neither removes nor repeats the FULL charge");
  });
}

test("shipping is free by default and FULL is an optional paid choice, whatever the pack or bump", async () => {
  assert.equal(shipping.FULL_SHIPPING_CENTS, 999);
  assert.equal(shipping.FULL_SHIPPING_LABEL, "Frete FULL");
  assert.equal(shipping.FREE_SHIPPING_LABEL, "Frete grátis");
  assert.deepEqual([...shipping.SHIPPING_METHODS], ["free", "full"]);
  assert.equal(shipping.DEFAULT_SHIPPING_METHOD, "free");
  assert.equal(shipping.shippingCentsFor("free"), 0);
  assert.equal(shipping.shippingCentsFor("full"), 999);
  assert.equal(shipping.shippingLabelOf("free"), "Frete grátis");
  assert.equal(shipping.shippingLabelOf("full"), "Frete FULL");
  assert.equal(shipping.shippingMethodOf("full"), "full");
  for (const stored of [undefined, null, "", "free", "FULL", "kit", 999, true]) {
    assert.equal(shipping.shippingMethodOf(stored), "free", `an unexpected stored value must never charge: ${String(stored)}`);
  }
  const cart = { selection: { pack: "unit", colors: ["azul"] }, step: "entrega" };
  for (const value of ["free", "full"]) assert.equal(schemas.cartSchema.safeParse({ ...cart, shipping: value }).success, true, value);
  for (const value of ["express", "FULL", 999, null]) assert.equal(schemas.cartSchema.safeParse({ ...cart, shipping: value }).success, false, String(value));
  for (const pack of ["unit", "kit"]) {
    for (const bump of [false, true]) {
      const free = await pricing.quoteBoth(pack, bump, 12);
      const full = await pricing.quoteBoth(pack, bump, 12, undefined, "full");
      for (const method of ["pix", "card"]) {
        assert.equal(free[method].shippingMethod, "free");
        assert.equal(free[method].shippingCents, 0);
        assert.equal(free[method].amountCents, free[method].productSubtotalCents);
        assert.equal(full[method].shippingMethod, "full");
        assert.equal(full[method].shippingCents, 999);
        assert.equal(full[method].productSubtotalCents, free[method].productSubtotalCents);
        assert.equal(full[method].amountCents, full[method].productSubtotalCents + 999);
      }
    }
  }
});

test("new orders snapshot product and shipping prices while old orders remain unknown", async () => {
  const selection = { pack: "unit", colors: ["azul"] };
  const q = await pricing.quote("unit", "pix", false);
  const item = orderPricing.orderItemFromQuote(selection, q);
  assert.equal(item.unitPrice, 149.71);
  assert.equal(q.amountCents, 14971);
  assert.deepEqual(plain(orderPricing.checkoutPricingOfOrder([item], q.amountCents)), {
    productSubtotalCents: 14971, shippingCents: 0, shippingMethod: "free", couponDiscountCents: 0,
  });
  const full = await pricing.quote("unit", "pix", false, 1, undefined, "full");
  const fullItem = orderPricing.orderItemFromQuote(selection, full);
  assert.equal(fullItem.unitPrice, 149.71, "the physical product must not include shipping");
  assert.equal(full.amountCents, 15970);
  assert.deepEqual(plain(orderPricing.checkoutPricingOfOrder([fullItem], full.amountCents)), {
    productSubtotalCents: 14971, shippingCents: 999, shippingMethod: "full", couponDiscountCents: 0,
  });
  assert.equal(orderPricing.checkoutPricingOfOrder([fullItem], q.amountCents), null, "a FULL snapshot does not explain a total without shipping");
  assert.equal(orderPricing.checkoutPricingOfOrder([catalog.orderItemOf(selection, 15990)], 15990), null);
  assert.equal(orderPricing.checkoutPricingOfOrder([item], 500), null, "a snapshot for a different payment total is not used");
  settingsOverrides.set("checkout.prices", { unit: { pix: 10000, card: 20000 }, kit: { pix: 25000, card: 30000 } });
  try {
    const changed = await pricing.quote("unit", "pix", false);
    assert.notEqual(changed.amountCents, q.amountCents);
    assert.equal(orderPricing.checkoutPricingOfOrder([item], q.amountCents).shippingCents, 0);
    assert.equal(orderPricing.checkoutPricingOfOrder([fullItem], full.amountCents).shippingCents, 999);
    assert.equal(item.unitPrice, 149.71);
    assert.equal(fullItem.unitPrice, 149.71);
  } finally { settingsOverrides.clear(); }
});

test("server installment limits and rounding", async () => {
  for (const [requested, expected] of [[-3, 1], [99, 12], [8.9, 8]]) {
    assert.equal((await pricing.quote("kit", "card", false, requested)).installments, expected);
  }
  assert.equal((await pricing.quote("unit", "card", false, 12)).installmentCents, 1498);
  assert.equal((await pricing.quote("unit", "card", false, 12, undefined, "full")).installmentCents, 1581);
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
    assert.equal(quoted.pix.couponDiscountCents, 23490);
    assert.equal(quoted.card.amountCents, 26990);
    assert.equal(quoted.card.couponDiscountCents, 0);
    assert.equal((await pricing.quote("unit", "pix", false, 1, "OTHER")).amountCents, 14971);
    assert.equal((await pricing.quote("unit", "card", false, 12, "TESTE")).amountCents, 17971);
    assert.equal((await pricing.quote("unit", "pix", false, 1, "OTHER", "full")).amountCents, 15970);
    assert.equal((await pricing.quote("unit", "card", false, 12, "TESTE", "full")).amountCents, 18970);
    settingsOverrides.set("checkout.testCoupon", { enabled: true, code: "TESTE", pixCents: 99999 });
    assert.equal((await pricing.quote("unit", "pix", false, 1, "TESTE")).amountCents, 14971, "a coupon cannot increase the total");
    assert.equal((await pricing.quote("unit", "pix", false, 1, "TESTE", "full")).amountCents, 15970, "a coupon cannot increase the total with FULL either");
  } finally { settingsOverrides.clear(); }
});

test("test coupon remains an exact total below FULL shipping without negative product prices", async () => {
  settingsOverrides.set("checkout.testCoupon", { enabled: true, code: "TESTE", pixCents: 500 });
  try {
    const selection = { pack: "unit", colors: ["azul"] };
    // Free shipping (default): the whole discount fits in the product, which keeps the 500 that was charged.
    const free = await pricing.quote("unit", "pix", false, 12, "TESTE");
    assert.equal(free.productSubtotalCents, 14971);
    assert.equal(free.shippingCents, 0);
    assert.equal(free.amountCents, 500);
    assert.equal(free.installmentCents, 500);
    assert.equal(free.couponDiscountCents, 14471);
    const freeItem = orderPricing.orderItemFromQuote(selection, free);
    assert.equal(freeItem.unitPrice, 5);
    assert.equal(orderPricing.checkoutPricingOfOrder([freeItem], 500).couponDiscountCents, 14471);
    // FULL: the charged 500 is below the 999 shipping, so the product goes to zero and never negative.
    const q = await pricing.quote("unit", "pix", false, 12, "TESTE", "full");
    assert.equal(q.productSubtotalCents, 14971);
    assert.equal(q.shippingCents, 999);
    assert.equal(q.amountCents, 500);
    assert.equal(q.installmentCents, 500);
    assert.equal(q.couponDiscountCents, 15470);
    assert.equal(q.productSubtotalCents + q.shippingCents - q.couponDiscountCents, q.amountCents);
    const item = orderPricing.orderItemFromQuote(selection, q);
    assert.equal(item.unitPrice, 0);
    assert.deepEqual(plain(orderPricing.checkoutPricingOfOrder([item], 500)), {
      productSubtotalCents: 14971, shippingCents: 999, shippingMethod: "full", couponDiscountCents: 15470,
    });
    assert.equal((await pricing.quote("unit", "card", false, 12, "TESTE")).amountCents, 17971);
    assert.equal((await pricing.quote("unit", "card", false, 12, "TESTE", "full")).amountCents, 18970);
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

test("mobile summary starts compact with a semantic non-submit button and valid target", async () => {
  const quotes = await pricing.quoteBoth("unit", false, 12);
  const html = summary({ selection: { pack: "unit", colors: ["azul"] }, quotes });
  const tag = [...html.matchAll(/<button\b[^>]*>/g)].find((match) => attributes(match[0])["aria-controls"] === "checkout-summary-details");
  assert.ok(tag, "summary must expose a button");
  const attrs = attributes(tag[0]);
  assert.equal(attrs.type, "button");
  assert.equal(attrs["aria-expanded"], "false", "the mobile reference starts with title, total and delivery benefit");
  assert.match(html, /<aside\b[^>]*data-expanded="false"/);
  assert.ok(attrs["aria-controls"]);
  assert.ok(html.includes(`id="${attrs["aria-controls"]}"`));
  assert.match(html, /<div\b[^>]*id="checkout-summary-details"[^>]*hidden=""/);
  assert.ok(text(html).includes(cleanMoney(money(quotes.pix.amountCents))));
  assert.ok(finalTotal(html).includes(cleanMoney(money(quotes.pix.amountCents))));
  assert.equal(deliveryRow(html), null, "free shipping has no cost row before the delivery step");
  const full = await pricing.quoteBoth("unit", false, 12, undefined, "full");
  const fullHtml = summary({ selection: { pack: "unit", colors: ["azul"] }, quotes: full });
  assert.equal(deliveryRow(fullHtml), FULL_DELIVERY_ROW, "a chosen FULL is always part of the summary");
  assert.ok(finalTotal(fullHtml).includes(cleanMoney(money(15970))));
});

// 2026-10-11 (conversion audit): the collapsed summary is one bar. The customer sees what is being bought and the
// amount to pay without opening it, which is why it may start collapsed on all three steps.
test("collapsed summary bar shows the product, quantity, colors, the live total and the action to open it", async () => {
  const unit = { pack: "unit", colors: ["azul"] };
  const quotes = await pricing.quoteBoth("unit", false, 12);
  const html = summary({ selection: unit, quotes });
  assert.match(html, /<aside\b[^>]*data-compact="true"/);
  const bar = summaryBar(html);
  assert.equal(bar.attrs["aria-expanded"], "false");
  assert.ok(!("aria-label" in bar.attrs), "the accessible name comes from the visible text, action included");
  assert.equal(bar.text, `AquaBlast Qtd. 1 ${cleanMoney(money(quotes.pix.amountCents))} Cor: Azul Ver resumo e valores`);
  assert.equal(bar.images.length, 1, "one thumbnail of the product");
  assert.equal(bar.images[0].src, "/thumbs/produto-azul-110.webp");
  assert.equal(bar.images[0].alt, "", "the thumbnail is decorative: the product is named beside it");

  const kitQuotes = await pricing.quoteBoth("kit", false, 12);
  const kit = summaryBar(summary({ selection: { pack: "kit", colors: ["vermelho", "preto"] }, quotes: kitQuotes }));
  assert.equal(kit.text, `AquaBlast Qtd. 2 ${cleanMoney(money(kitQuotes.pix.amountCents))} Vermelho + Preto Ver resumo e valores`);
  assert.equal(kit.images[0].src, "/thumbs/produto-vermelho-110.webp");

  // The total follows the second unit and the paid FULL as soon as the server quote changes.
  const bumpQuotes = await pricing.quoteBoth("unit", true, 12);
  const pending = summaryBar(summary({ selection: unit, bump: true, bumpColor: null, quotes: bumpQuotes }));
  assert.equal(pending.text, `AquaBlast Qtd. 2 ${cleanMoney(money(bumpQuotes.pix.amountCents))} Cor: Azul Ver resumo e valores`);
  const confirmed = summaryBar(summary({ selection: unit, bump: true, bumpColor: "vermelho", quotes: bumpQuotes }));
  assert.equal(confirmed.text, `AquaBlast Qtd. 2 ${cleanMoney(money(bumpQuotes.pix.amountCents))} Azul + Vermelho Ver resumo e valores`);
  const full = summaryBar(summary({ selection: unit, quotes: await pricing.quoteBoth("unit", false, 12, undefined, "full") }));
  assert.ok(full.text.includes(cleanMoney(money(15970))), "a chosen FULL is in the bar total");
  const card = summaryBar(summary({ selection: unit, quotes, payView: "card" }));
  assert.ok(card.text.includes(cleanMoney(money(quotes.card.amountCents))), "on the card the bar shows the card total");
});

test("summary disclosure follows the viewport only until the customer chooses", () => {
  assert.equal(summaryIsExpanded(null, true, false), false, "mobile starts collapsed");
  assert.equal(summaryIsExpanded(null, false, false), true, "desktop starts expanded");
  for (const mobile of [true, false]) {
    assert.equal(summaryIsExpanded(true, mobile, false), true, "opening survives resize/quote renders");
    assert.equal(summaryIsExpanded(false, mobile, false), false, "closing survives resize/quote renders");
    assert.equal(summaryIsExpanded(null, mobile, true), true, "paid summary starts open");
  }
});

test("inline coupon and totals precede products, with delivery benefit outside the disclosure", async () => {
  const html = summary({ selection: { pack: "kit", colors: ["azul", "preto"] }, quotes: await pricing.quoteBoth("kit", false, 12), onCouponApply: async () => null });
  const couponPosition = html.indexOf('aria-label="Cupom de desconto"');
  const totalPosition = html.indexOf("Total no Pix</dt>");
  const productPosition = html.indexOf('aria-label="Produtos e cores escolhidas"');
  assert.ok(couponPosition > 0 && couponPosition < totalPosition && totalPosition < productPosition);
  // 2026-10-11: the always-open "Tem um cupom?" field became a collapsed disclosure. Without a coupon only the
  // "Tenho um cupom" button shows; the same field and submit button stay in the HTML, inside the hidden panel.
  const coupon = couponDisclosure(html);
  assert.equal(coupon.attrs["aria-expanded"], "false", "without a coupon the field starts collapsed");
  assert.ok(coupon.panelHidden, "the collapsed coupon panel is hidden");
  assert.ok(!html.includes("Tem um cupom?"), "the always-open label is gone");
  assert.match(html, /<input[^>]*id="checkout-coupon"[^>]*aria-label="Cupom de desconto"/, "without the visible label the field keeps an accessible name");
  assert.match(html, /<button[^>]*type="submit"[^>]*>Adicionar<\/button>/);
  assert.match(html, /<input[^>]*id="checkout-coupon"[^>]*name="coupon"/);
  assert.ok(!html.includes("<dialog"), "the coupon is inline rather than behind a modal");
  const detailsStart = html.indexOf('id="checkout-summary-details"');
  const openStart = html.lastIndexOf("<div", detailsStart);
  let depth = 0;
  let detailsEnd = -1;
  for (const tag of html.slice(openStart).matchAll(/<\/?div\b[^>]*>/g)) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth === 0) { detailsEnd = openStart + tag.index + tag[0].length; break; }
  }
  assert.ok(detailsEnd > openStart);
  const benefitPosition = html.indexOf('data-summary-benefit="shipping"');
  assert.ok(benefitPosition > detailsEnd, "delivery benefit remains outside the hidden disclosure");
  assert.match(html, /Seu pedido tem <strong>frete grátis<\/strong>/);
  assert.ok(!/cashback|brinde/i.test(text(html)), "no fictional reference promotion is copied");
});

for (const selectedColors of [["azul", "preto"], ["vermelho", "vermelho"]]) {
  test(`summary retains both kit colors: ${selectedColors.join(" + ")}`, async () => {
    const quotes = await pricing.quoteBoth("kit", false, 12);
    const html = summary({ selection: { pack: "kit", colors: selectedColors }, quotes, shippingChosen: true });
    const images = productImages(html);
    const rows = productRows(html);
    assert.equal(images.length, 2, "kit must render two separate product images");
    assert.equal(rows.length, 2, "each unit must have its own semantic product row");
    selectedColors.forEach((color, index) => {
      assert.equal(images[index].src, `/thumbs/produto-${color}-110.webp`);
      assert.equal(images[index].alt, `AquaBlast ${constants.COLOR_LABELS[color].toLowerCase()}`);
      assert.equal(rows[index].attrs["data-summary-unit"], String(index + 1));
      assert.equal(rows[index].attrs["data-summary-color"], color);
      assert.ok(text(rows[index].html).includes(`${index + 1}ª unidade · ${constants.COLOR_LABELS[color]}`));
    });
    assert.ok(finalTotal(html).includes(cleanMoney(money(quotes.pix.amountCents))));
    assert.equal(deliveryRow(html), FREE_DELIVERY_ROW, "after the delivery step the free shipping is a row of the summary");
    assert.equal(deliveryRow(summary({ selection: { pack: "kit", colors: selectedColors }, quotes })), null, "before it, the row does not exist");
  });
}

test("card summary displays the exact total as well as rounded installments", async () => {
  const quotes = await pricing.quoteBoth("kit", false, 12);
  // The card view only exists in the payment step, after the delivery choice.
  const html = summary({ selection: { pack: "kit", colors: ["azul", "preto"] }, quotes, payView: "card", shippingChosen: true });
  assert.ok(finalTotal(html).includes(cleanMoney(money(26990))), "card total must not be inferred by multiplying rounded installments");
  assert.ok(text(html).includes(`12x de ${cleanMoney(money(2249))}`));
  assert.equal(deliveryRow(html), FREE_DELIVERY_ROW);
});

test("pending bump includes its price and delivery without inventing a second color", async () => {
  const selection = { pack: "unit", colors: ["azul"] };
  assert.deepEqual(plain(effectiveSelectionClient(selection, true, null)), selection);
  const quotes = await pricing.quoteBoth("unit", true, 12);
  // The second unit is offered in the payment step, after the delivery choice.
  const html = summary({ selection, bump: true, bumpColor: null, quotes, shippingChosen: true });
  assert.equal(productImages(html).length, 1, "no photo of a second unit before its color is chosen");
  assert.equal(productRows(html).length, 1);
  const bumpRow = /<div\b[^>]*data-summary-bump="pending"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(bumpRow, "a pending bump must remain visible in the summary");
  assert.equal(quotes.pix.bumpDeltaCents, 9019);
  assert.ok(text(bumpRow[1]).includes(cleanMoney(money(quotes.pix.bumpDeltaCents))));
  assert.ok(text(bumpRow[1]).includes("falta escolher a cor"));
  assert.ok(finalTotal(html).includes(cleanMoney(money(quotes.pix.amountCents))));
  assert.equal(deliveryRow(html), FREE_DELIVERY_ROW);
  const full = await pricing.quoteBoth("unit", true, 12, undefined, "full");
  const fullHtml = summary({ selection, bump: true, bumpColor: null, quotes: full, shippingChosen: true });
  assert.equal(deliveryRow(fullHtml), FULL_DELIVERY_ROW, "the second unit does not remove a chosen FULL");
  assert.ok(finalTotal(fullHtml).includes(cleanMoney(money(24989))));
});

test("confirmed bump renders the chosen second color rather than repeating the first", async () => {
  const selection = { pack: "unit", colors: ["azul"] };
  assert.deepEqual(plain(effectiveSelectionClient(selection, true, "vermelho")), { pack: "kit", colors: ["azul", "vermelho"] });
  const html = summary({ selection, bump: true, bumpColor: "vermelho", quotes: await pricing.quoteBoth("unit", true, 12) });
  const images = productImages(html);
  assert.equal(images.length, 2);
  assert.equal(images[1].src, "/thumbs/produto-vermelho-110.webp");
  assert.equal(images[1].alt, "AquaBlast vermelho");
  const rows = productRows(html);
  assert.equal(rows[1].attrs["data-summary-unit"], "2");
  assert.equal(rows[1].attrs["data-summary-color"], "vermelho");
  assert.match(html, /data-summary-bump="confirmed"/);
});

test("summary separates the server Pix discount from the coupon without double counting", async () => {
  settingsOverrides.set("checkout.testCoupon", { enabled: true, code: "TESTE", pixCents: 500 });
  try {
    const quotes = await pricing.quoteBoth("kit", false, 12, "TESTE");
    const html = summary({ selection: { pack: "kit", colors: ["azul", "preto"] }, quotes, coupon: "TESTE", onCouponApply: async () => null, shippingChosen: true });
    assert.equal(amountRow(html, "Produtos"), cleanMoney(money(26990)));
    assert.equal(amountRow(html, "Desconto no Pix"), `- ${cleanMoney(money(3000))}`);
    assert.equal(amountRow(html, "Desconto do cupom no Pix"), `- ${cleanMoney(money(23490))}`);
    assert.equal(finalTotal(html), `Total no Pix ${cleanMoney(money(500))}`);
    assert.match(html, /Cupom aplicado ao pagamento no Pix/);
    // An applied coupon (also one that came in the URL) opens the collapsed field on its own.
    const applied = couponDisclosure(html);
    assert.equal(applied.attrs["aria-expanded"], "true");
    assert.ok(!applied.panelHidden, "the applied coupon and its confirmation are never hidden");
    assert.equal(deliveryRow(html), FREE_DELIVERY_ROW);
  } finally { settingsOverrides.clear(); }
});

test("Pix-only summary uses its quote without inventing a card discount", async () => {
  for (const [shippingMethod, totalCents, row] of [["free", 14971, null], ["full", 15970, FULL_DELIVERY_ROW]]) {
    const quotes = await pricing.quoteBoth("unit", false, 12, undefined, shippingMethod);
    const html = summary({ selection: { pack: "unit", colors: ["azul"] }, quotes, cardEnabled: false });
    assert.equal(quotes.pix.productSubtotalCents, 14971);
    assert.equal(quotes.pix.amountCents, totalCents);
    assert.equal(amountRow(html, "Produtos"), cleanMoney(money(quotes.pix.productSubtotalCents)));
    assert.equal(finalTotal(html), `Total no Pix ${cleanMoney(money(quotes.pix.amountCents))}`);
    assert.ok(!text(html).includes("Desconto no Pix"));
    assert.ok(!text(html).includes("sem juros no cartão"));
    assert.equal(deliveryRow(html), row, "before the delivery step only a chosen FULL has a shipping row");
  }
});

test("single-unit summary has free shipping by default and separates the optional FULL from products in both payment methods", async () => {
  for (const [shippingMethod, row] of [["free", FREE_DELIVERY_ROW], ["full", FULL_DELIVERY_ROW]]) {
    const quotes = await pricing.quoteBoth("unit", false, 12, undefined, shippingMethod);
    for (const method of ["pix", "card"]) {
      // A chosen payment method means the payment step, after the delivery choice.
      const html = summary({ selection: { pack: "unit", colors: ["preto"] }, quotes, payView: method, shippingChosen: true });
      assert.equal(amountRow(html, "Produtos"), cleanMoney(money(17971)));
      assert.equal(deliveryRow(html), row);
      assert.equal(quotes[method].amountCents, (method === "pix" ? 14971 : 17971) + (shippingMethod === "full" ? 999 : 0));
      assert.ok(finalTotal(html).includes(cleanMoney(money(quotes[method].amountCents))));
      if (shippingMethod === "free") {
        assert.ok(/Seu pedido tem frete grátis/i.test(text(html)), "one unit has free shipping by default");
      } else {
        assert.ok(!/Seu pedido tem frete grátis/i.test(text(html)), "a paid FULL must not be advertised as free shipping");
        assert.ok(text(html).includes("Entrega por Frete FULL"));
      }
    }
  }
});

test("single-unit summary accounts for a test coupon including shipping exactly once", async () => {
  settingsOverrides.set("checkout.testCoupon", { enabled: true, code: "TESTE", pixCents: 500 });
  try {
    for (const [shippingMethod, couponCents, row] of [["free", 14471, FREE_DELIVERY_ROW], ["full", 15470, FULL_DELIVERY_ROW]]) {
      const quotes = await pricing.quoteBoth("unit", false, 12, "TESTE", shippingMethod);
      const html = summary({ selection: { pack: "unit", colors: ["azul"] }, quotes, coupon: "TESTE", onCouponApply: async () => null, shippingChosen: true });
      assert.equal(amountRow(html, "Produtos"), cleanMoney(money(17971)));
      assert.equal(amountRow(html, "Desconto no Pix"), `- ${cleanMoney(money(3000))}`);
      assert.equal(amountRow(html, "Desconto do cupom no Pix"), `- ${cleanMoney(money(couponCents))}`);
      assert.equal(deliveryRow(html), row);
      assert.equal(finalTotal(html), `Total no Pix ${cleanMoney(money(500))}`);
      assert.equal(17971 - 3000 - couponCents + quotes.pix.shippingCents, 500, "the rows shown add up to the charged total");
    }
  } finally { settingsOverrides.clear(); }
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

test("old paid unit summary does not invent shipping from the new offer", async () => {
  // The current offer carries a paid FULL (999): an old order without a snapshot must still show no delivery line.
  const base = { selection: { pack: "unit", colors: ["azul"] }, quotes: await pricing.quoteBoth("unit", false, 12, undefined, "full"), shippingChosen: true };
  const paid = { orderNumber: "OLD-PAID", method: "pix", amountCents: 15990, installments: 1, cardBrand: null, cardLast4: null, testMode: true };
  const html = summary({ ...base, paid });
  assert.ok(finalTotal(html).includes(cleanMoney(money(15990))));
  assert.equal(deliveryRow(html), null, "old orders without a shipping snapshot have no inferred delivery line");
  assert.ok(!text(html).includes(cleanMoney(money(999))));
  // An order that recorded its shipping shows exactly that, under "Entrega".
  assert.equal(deliveryRow(summary({ ...base, paid: { ...paid, amountCents: 15970, shippingCents: 999 } })), `Entrega ${cleanMoney(money(999))}`);
  assert.equal(deliveryRow(summary({ ...base, paid: { ...paid, amountCents: 14971, shippingCents: 0 } })), "Entrega Grátis");
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
