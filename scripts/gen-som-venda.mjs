// Gera o som de aviso de venda do app "AquaBlast Vendas" (caixa registradora, "ka-ching").
//
// ATENÇÃO (2026-10-01): o som em uso deixou de ser este. public/admin-app/venda.mp3 e venda.wav são um
// recorte do arquivo escolhido pelo dono. Rodar este script SOBRESCREVE os dois e volta para o sintetizado;
// se for de propósito, mude também o `?v=` de SALE_SOUND_URL (src/components/admin/pwa/pwa-client.ts).
//
// Por que síntese e não arquivo baixado: sons de plataformas (Yampi, Shopify...) têm dono; aqui o som é
// 100% gerado por código, sem biblioteca nova e sem custo. Roda fora de src/ e não entra no build.
//
// Uso:  node scripts/gen-som-venda.mjs
// Saída: public/admin-app/venda.wav (PCM 16-bit mono 44,1 kHz) e, se o ffmpeg estiver no PATH,
//        public/admin-app/venda.mp3 (128 kbps). O ruído usa semente fixa, então o resultado é sempre igual.
//
// Receita do som:
//   1. gaveta: 3 cliques mecânicos (ruído filtrado bem curto) + um "tum" grave e um leve arrasto da gaveta;
//   2. "ching" 1: sino com parciais inarmônicos (~2,1 / 3,2 / 4,4 / 5,9 kHz) com decaimentos diferentes;
//   3. "ching" 2: o mesmo sino ~12% mais agudo, 75 ms depois, que é o que dá o "ka-CHING" duplo;
//   4. fade-out no fim e normalização do pico a -1 dBFS.

import { writeFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const DURACAO = 1.4; // segundos (briefing: 1,0 a 1,6 s)
const PICO_DBFS = -1;
const FADE_OUT = 0.3; // segundos finais com fade
const LIMITE_BYTES = 150 * 1024;

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const pastaSaida = join(raiz, "public", "admin-app");
const arqWav = join(pastaSaida, "venda.wav");
const arqMp3 = join(pastaSaida, "venda.mp3");

const N = Math.round(SR * DURACAO);
const buf = new Float64Array(N);

// PRNG com semente (mulberry32): mesmo arquivo a cada execução.
let semente = 0x5eed1234;
function aleatorio() {
  semente |= 0;
  semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ruido = () => aleatorio() * 2 - 1;

// Filtro passa-faixa biquad (RBJ cookbook), para dar "cor" ao ruído dos cliques.
function passaFaixa(freq, q) {
  const w0 = (2 * Math.PI * freq) / SR;
  const alfa = Math.sin(w0) / (2 * q);
  const a0 = 1 + alfa;
  const b0 = alfa / a0;
  const b2 = -alfa / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alfa) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// Soma um trecho no buffer a partir do instante `t0` (s), com `dur` (s).
function soma(t0, dur, gerador) {
  const i0 = Math.round(t0 * SR);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n && i0 + i < N; i++) buf[i0 + i] += gerador(i / SR);
}

// 1. Gaveta: cliques mecânicos (transientes de ruído com decaimento de poucos ms).
function clique(t0, freq, ganho, tau) {
  const f1 = passaFaixa(freq, 1.2);
  const f2 = passaFaixa(freq * 2.3, 2.5);
  soma(t0, 0.06, (t) => {
    const env = Math.exp(-t / tau);
    const r = ruido();
    return ganho * env * (f1(r) * 1.0 + f2(r) * 0.5);
  });
}
clique(0.0, 1800, 2.6, 0.006);
clique(0.032, 2600, 2.2, 0.005);
clique(0.068, 1400, 2.4, 0.009);

// "Tum" grave da gaveta batendo no batente.
soma(0.068, 0.12, (t) => 0.5 * Math.exp(-t / 0.03) * Math.sin(2 * Math.PI * (140 - 200 * t) * t));

// Arrasto curto da gaveta (ruído grave e baixo, entre os cliques).
{
  const f = passaFaixa(700, 0.8);
  soma(0.005, 0.1, (t) => {
    const env = Math.sin((Math.PI * t) / 0.1) ** 2;
    return 0.12 * env * f(ruido());
  });
}

// 2 e 3. Sino: parciais inarmônicos, cada um com o seu decaimento (os agudos morrem antes).
const PARCIAIS = [
  { f: 2100, a: 1.0, tau: 0.42 },
  { f: 3200, a: 0.62, tau: 0.3 },
  { f: 4400, a: 0.42, tau: 0.2 },
  { f: 5900, a: 0.26, tau: 0.12 },
  { f: 7300, a: 0.12, tau: 0.07 }, // brilho extra da batida
];

function sino(t0, transp, ganho, sustentacao) {
  // batida do martelinho: um tique de ruído agudo bem curto
  const fb = passaFaixa(6500 * transp, 1.5);
  soma(t0, 0.02, (t) => ganho * 0.5 * Math.exp(-t / 0.0025) * fb(ruido()));

  const fases = PARCIAIS.map(() => aleatorio() * 2 * Math.PI);
  soma(t0, DURACAO - t0, (t) => {
    const ataque = Math.min(1, t / 0.0015);
    let s = 0;
    PARCIAIS.forEach((p, k) => {
      // leve batimento (dois modos quase iguais) dá o "shimmer" metálico
      const bat = 1 + 0.18 * Math.cos(2 * Math.PI * (3 + k * 1.7) * t);
      s += p.a * bat * Math.exp(-t / (p.tau * sustentacao)) * Math.sin(2 * Math.PI * p.f * transp * t + fases[k]);
    });
    return ganho * ataque * s;
  });
}
sino(0.1, 1.0, 0.55, 1.0);
sino(0.175, 1.12, 0.6, 1.25); // segundo "ching", mais agudo, 75 ms depois

// Remove DC (passa-altas de 1ª ordem ~30 Hz), fade-out e normalização.
{
  const r = Math.exp((-2 * Math.PI * 30) / SR);
  let xAnt = 0, yAnt = 0;
  for (let i = 0; i < N; i++) {
    const y = buf[i] - xAnt + r * yAnt;
    xAnt = buf[i]; yAnt = y; buf[i] = y;
  }
}
{
  const nFade = Math.round(FADE_OUT * SR);
  for (let i = 0; i < nFade; i++) {
    const g = 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / nFade)); // cosseno: 1 -> 0
    buf[N - nFade + i] *= g;
  }
  buf[N - 1] = 0;
}
// Fade-in de 1 ms para não estalar no primeiro sample.
for (let i = 0; i < 44; i++) buf[i] *= i / 44;

let pico = 0;
for (const v of buf) pico = Math.max(pico, Math.abs(v));
const alvo = 10 ** (PICO_DBFS / 20);
const escala = alvo / pico;

// WAV PCM 16-bit mono, cabeçalho escrito à mão (44 bytes).
const dados = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  const v = Math.max(-1, Math.min(1, buf[i] * escala));
  dados.writeInt16LE(Math.round(v * 32767), i * 2);
}
const cab = Buffer.alloc(44);
cab.write("RIFF", 0, "ascii");
cab.writeUInt32LE(36 + dados.length, 4);
cab.write("WAVE", 8, "ascii");
cab.write("fmt ", 12, "ascii");
cab.writeUInt32LE(16, 16); // tamanho do bloco fmt
cab.writeUInt16LE(1, 20); // PCM
cab.writeUInt16LE(1, 22); // mono
cab.writeUInt32LE(SR, 24);
cab.writeUInt32LE(SR * 2, 28); // byte rate
cab.writeUInt16LE(2, 32); // block align
cab.writeUInt16LE(16, 34); // bits por amostra
cab.write("data", 36, "ascii");
cab.writeUInt32LE(dados.length, 40);

mkdirSync(pastaSaida, { recursive: true });
writeFileSync(arqWav, Buffer.concat([cab, dados]));

// Validação: relê o WAV do disco e confere duração, pico e tamanho.
const lido = readFileSync(arqWav);
const nLido = lido.readUInt32LE(40) / 2;
let picoInt = 0;
for (let i = 0; i < nLido; i++) picoInt = Math.max(picoInt, Math.abs(lido.readInt16LE(44 + i * 2)));
const picoDb = 20 * Math.log10(picoInt / 32768);
const tamWav = statSync(arqWav).size;
const relatorio = [
  `venda.wav: ${(nLido / SR).toFixed(3)} s, mono ${SR} Hz 16-bit, pico ${picoDb.toFixed(2)} dBFS, ` +
    `${(tamWav / 1024).toFixed(1)} KB`,
];
if (picoInt >= 32767) throw new Error("clipping no WAV");
if (tamWav > LIMITE_BYTES) throw new Error(`WAV passou de 150 KB (${tamWav} bytes)`);

// MP3 opcional, só se o ffmpeg existir.
const temFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
if (temFfmpeg) {
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", arqWav, "-codec:a", "libmp3lame", "-b:a", "128k", "-ac", "1", arqMp3],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("ffmpeg falhou ao gerar o MP3");
  relatorio.push(`venda.mp3: 128 kbps, ${(statSync(arqMp3).size / 1024).toFixed(1)} KB`);
} else {
  relatorio.push("ffmpeg não encontrado no PATH: MP3 não gerado (o WAV basta).");
}

process.stdout.write(relatorio.join("\n") + "\n");
