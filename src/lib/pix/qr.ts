/*
 * Gerador de QR Code (modo byte, correcao M) para o copia-e-cola do Pix.
 *
 * Porte TypeScript reduzido do "QR Code generator library" de Project Nayuki
 * (https://www.nayuki.io/page/qr-code-generator-library). So o necessario para
 * o BR Code: segmento unico em modo byte (UTF-8), nivel M fixo, versao 1-40 e
 * mascara escolhidas automaticamente (menor penalidade).
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */

// Tabelas do nivel M (indice = versao; posicao 0 nao usada).
const ECC_CODEWORDS_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28,
];
const NUM_ERROR_CORRECTION_BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40,
  43, 45, 47, 49,
];
const FORMAT_BITS_M = 0;

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(ver: number): number {
  return Math.floor(getNumRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK_M[ver] * NUM_ERROR_CORRECTION_BLOCKS_M[ver];
}

function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function reedSolomonComputeDivisor(degree: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= reedSolomonMultiply(coef, factor);
    });
  }
  return result;
}

/** Matriz do QR: true = modulo escuro. Linhas por y, colunas por x. */
export type QrMatrix = boolean[][];

class QrBuilder {
  readonly size: number;
  private readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(
    private readonly version: number,
    dataCodewords: readonly number[],
  ) {
    this.size = version * 4 + 17;
    this.modules = [];
    this.isFunction = [];
    for (let i = 0; i < this.size; i++) {
      this.modules.push(new Array<boolean>(this.size).fill(false));
      this.isFunction.push(new Array<boolean>(this.size).fill(false));
    }
    this.drawFunctionPatterns();
    this.drawCodewords(this.addEccAndInterleave(dataCodewords));

    let mask = 0;
    let minPenalty = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 8; i++) {
      this.applyMask(i);
      this.drawFormatBits(i);
      const penalty = this.getPenaltyScore();
      if (penalty < minPenalty) {
        mask = i;
        minPenalty = penalty;
      }
      this.applyMask(i); // desfaz (XOR)
    }
    this.applyMask(mask);
    this.drawFormatBits(mask);
  }

  matrix(): QrMatrix {
    return this.modules.map((row) => row.slice());
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    const pos = this.getAlignmentPatternPositions();
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const corner = (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
        if (!corner) this.drawAlignmentPattern(pos[i], pos[j]);
      }
    }
    this.drawFormatBits(0); // reserva a area; redesenhado depois da mascara
    this.drawVersion();
  }

  private drawFormatBits(mask: number): void {
    const data = (FORMAT_BITS_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true);
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  private addEccAndInterleave(data: readonly number[]): number[] {
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS_M[this.version];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[this.version];
    const rawCodewords = Math.floor(getNumRawDataModules(this.version) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: number[][] = [];
    const rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      const ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    const result: number[] = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
      });
    }
    return result;
  }

  private drawCodewords(data: readonly number[]): void {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  private getPenaltyScore(): number {
    let result = 0;
    const size = this.size;
    const at = (x: number, y: number, byRow: boolean): boolean => (byRow ? this.modules[y][x] : this.modules[x][y]);

    for (const byRow of [true, false]) {
      for (let a = 0; a < size; a++) {
        let runColor = false;
        let run = 0;
        const history = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < size; b++) {
          const c = at(b, a, byRow);
          if (c === runColor) {
            run++;
            if (run === 5) result += PENALTY_N1;
            else if (run > 5) result++;
          } else {
            this.finderPenaltyAddHistory(run, history);
            if (!runColor) result += this.finderPenaltyCountPatterns(history) * PENALTY_N3;
            runColor = c;
            run = 1;
          }
        }
        result += this.finderPenaltyTerminateAndCount(runColor, run, history) * PENALTY_N3;
      }
    }

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) result += PENALTY_N2;
      }
    }

    let dark = 0;
    for (const row of this.modules) dark += row.reduce((sum, c) => sum + (c ? 1 : 0), 0);
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }

  private finderPenaltyCountPatterns(h: readonly number[]): number {
    const n = h[1];
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  }

  private finderPenaltyTerminateAndCount(runColor: boolean, runLength: number, history: number[]): number {
    let len = runLength;
    if (runColor) {
      this.finderPenaltyAddHistory(len, history);
      len = 0;
    }
    len += this.size;
    this.finderPenaltyAddHistory(len, history);
    return this.finderPenaltyCountPatterns(history);
  }

  private finderPenaltyAddHistory(runLength: number, history: number[]): void {
    const len = history[0] === 0 ? runLength + this.size : runLength;
    history.pop();
    history.unshift(len);
  }
}

/** Codifica o texto (UTF-8, modo byte, correcao M) e devolve a matriz de modulos. */
export function qrMatrix(text: string): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  let capacityBits = 0;
  for (; ; version++) {
    if (version > 40) throw new Error("Texto longo demais para um QR Code.");
    capacityBits = getNumDataCodewords(version) * 8;
    const ccBits = version <= 9 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= capacityBits) break;
  }

  const bits: number[] = [];
  const append = (val: number, len: number): void => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  append(0x4, 4); // modo byte
  append(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) append(b, 8);
  append(0, Math.min(4, capacityBits - bits.length)); // terminador
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) append(pad, 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }
  return new QrBuilder(version, codewords).matrix();
}

/** SVG do QR (fundo branco, margem de 4 modulos). Linhas escuras agrupadas em retangulos horizontais. */
export function qrSvg(text: string, border = 4): string {
  const m = qrMatrix(text);
  const size = m.length;
  const dim = size + border * 2;
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; ) {
      if (!m[y][x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && m[y][x + run]) run++;
      path += `M${x + border} ${y + border}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}

/** QR em data URI (img-src data: ja liberado na CSP). Gerado na resposta; nao gravar no banco. */
export function qrSvgDataUri(text: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text))}`;
}

/**
 * QR que vai para a tela: a imagem do gateway quando ele manda uma data:image; senao o nosso, gerado do
 * copia-e-cola (URL externa de QR nao entra: pode expirar, cair ou ser barrada; o copia-e-cola e a fonte da verdade).
 */
export function pixQrForScreen(code: string, gatewayQr: string | null | undefined): string | null {
  if (gatewayQr?.startsWith("data:image")) return gatewayQr;
  if (!code) return null;
  try {
    return qrSvgDataUri(code);
  } catch {
    return null;
  }
}
