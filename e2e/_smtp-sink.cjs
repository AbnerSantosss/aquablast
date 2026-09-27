/* eslint-disable @typescript-eslint/no-require-imports */
// Coletor SMTP minimo (so 127.0.0.1:2525). Aceita qualquer mensagem e grava em e2e/out/mail/<n>.eml.
// Nada sai da maquina. Usado pelos testes para o cron de carrinho abandonado e os e-mails do pedido.
//   node e2e/_smtp-sink.cjs            (fica rodando; pare com Ctrl+C ou matando o processo)
const net = require("net");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "out", "mail");
fs.mkdirSync(DIR, { recursive: true });
let seq = fs.readdirSync(DIR).filter((f) => f.endsWith(".eml")).length;

const server = net.createServer((sock) => {
  sock.setEncoding("utf8");
  let buf = "";
  let inData = false;
  let data = [];
  let envelope = { from: "", to: [] };
  const reply = (s) => sock.write(`${s}\r\n`);
  reply("220 sink.local ESMTP e2e");
  sock.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (inData) {
        if (line === ".") {
          inData = false;
          seq += 1;
          const file = path.join(DIR, `${String(seq).padStart(3, "0")}.eml`);
          const head = `X-Sink-From: ${envelope.from}\r\nX-Sink-To: ${envelope.to.join(", ")}\r\n`;
          fs.writeFileSync(file, head + data.join("\r\n"));
          data = [];
          envelope = { from: "", to: [] };
          reply("250 OK queued");
        } else data.push(line.startsWith("..") ? line.slice(1) : line);
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO") {
        sock.write("250-sink.local\r\n250-8BITMIME\r\n250-SMTPUTF8\r\n250 SIZE 10485760\r\n");
      } else if (cmd === "HELO") reply("250 sink.local");
      else if (cmd === "MAIL") {
        envelope.from = line.replace(/^MAIL FROM:\s*/i, "");
        reply("250 OK");
      } else if (cmd === "RCPT") {
        envelope.to.push(line.replace(/^RCPT TO:\s*/i, ""));
        reply("250 OK");
      } else if (cmd === "DATA") {
        inData = true;
        reply("354 End data with <CR><LF>.<CR><LF>");
      } else if (cmd === "RSET") {
        envelope = { from: "", to: [] };
        reply("250 OK");
      } else if (cmd === "NOOP") reply("250 OK");
      else if (cmd === "QUIT") {
        reply("221 Bye");
        sock.end();
      } else reply("502 Not implemented");
    }
  });
  sock.on("error", () => {});
});

server.listen(2525, "127.0.0.1", () => process.stdout.write("smtp sink em 127.0.0.1:2525\n"));
