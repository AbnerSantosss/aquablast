/*
 * Service worker do app do painel AquaBlast (PWA /admin). Registrado pelo layout do painel
 * (src/components/admin/pwa/AdminPwa.tsx) com scope "/admin".
 * - push: mostra a notificação (o Chrome exige uma notificação por push) e avisa as abas abertas do
 *   painel, que tocam a caixa registradora em venda. O SW NÃO toca áudio (não tem como).
 * - notificationclick: foca uma aba do painel (navegando para a URL do aviso) ou abre uma nova.
 * Sem cache offline de propósito: o painel precisa de dados frescos e de login.
 * Ver wiki/operacao/aquablast-app-vendas-pwa.md.
 */
"use strict";

const ICON = "/admin-app/icon-192.png";
const BADGE = "/admin-app/badge-96.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function safeUrl(u) {
  return typeof u === "string" && u.startsWith("/admin") ? u : "/admin";
}

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: "AquaBlast", body: event.data ? event.data.text() : "" };
  }
  const title = String(msg.title || "AquaBlast");
  const url = safeUrl(msg.url);
  const options = {
    body: String(msg.body || ""),
    icon: ICON,
    badge: BADGE,
    tag: String(msg.tag || "aquablast"),
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    timestamp: msg.at ? Date.parse(msg.at) || Date.now() : Date.now(),
    data: { url: url, kind: msg.kind || "event", orderId: msg.orderId || null },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        for (const c of list) {
          c.postMessage({ type: "aqb:push", title: title, body: options.body, url: url, kind: msg.kind || "event", orderId: msg.orderId || null });
        }
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        const path = new URL(c.url).pathname;
        if (path.startsWith("/admin") && "focus" in c) {
          return c.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
