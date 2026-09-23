import { and, eq, gt, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { orderAccessCodes } from "@/db/schema";
import { getBuyerSession } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getOrderById, getPublicOrder, type PublicOrder } from "@/lib/orders/service";
import { isSameOrigin, jsonError } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 5_000; // verificação de `revision` no banco
const PING_MS = 20_000; // heartbeat `: ping`
const MAX_LIFETIME_MS = 10 * 60_000; // depois disso o servidor encerra; o EventSource do cliente reconecta
const AUTH_RECHECK_MS = 60_000; // revalida o código de acesso (revogação/expiração) durante o stream

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "private, no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  Vary: "Cookie",
};

/** O código que originou a sessão ainda vale? (não revogado, não expirado, mesmo pedido) */
async function accessStillValid(codeId: string, orderId: string): Promise<boolean> {
  const row = await db.query.orderAccessCodes.findFirst({
    columns: { id: true },
    where: and(
      eq(orderAccessCodes.id, codeId),
      eq(orderAccessCodes.orderId, orderId),
      isNull(orderAccessCodes.revokedAt),
      gt(orderAccessCodes.expiresAt, new Date()),
    ),
  });
  return Boolean(row);
}

/**
 * GET /api/orders/events?orderId=<id> — SSE autorizado pelo cookie do comprador.
 * Envia o snapshot completo (`event: order.updated`) na abertura e sempre que `revision`
 * aumentar; `: ping` a cada 20 s; encerra após 10 min ou quando a autorização deixa de valer.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden", "Origem não permitida.");
  const orderId = request.nextUrl.searchParams.get("orderId")?.trim() ?? "";
  if (!orderId || orderId.length > 120) return jsonError(400, "bad_request", "Informe o pedido.");

  const session = await getBuyerSession();
  if (!session) return jsonError(401, "unauthorized", "Sessão não encontrada. Consulte o pedido novamente.");
  if (session.orderId !== orderId) return jsonError(403, "forbidden", "Sessão não corresponde a este pedido.");

  let snapshot: PublicOrder | null;
  try {
    await ensureBootstrap();
    if (!(await accessStillValid(session.codeId, orderId))) {
      return jsonError(401, "unauthorized", "Acesso expirado. Consulte o pedido novamente.");
    }
    snapshot = await getPublicOrder(orderId);
  } catch {
    return jsonError(500, "server_error", "Não foi possível abrir o acompanhamento agora.");
  }
  if (!snapshot) return jsonError(404, "not_found", "Pedido não localizado.");

  const encoder = new TextEncoder();
  const initial = snapshot;
  let revision = initial.revision;
  let closed = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let lifeTimer: ReturnType<typeof setTimeout> | undefined;
  let lastAuthCheck = Date.now();
  let checking = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const emit = (order: PublicOrder) => send(`event: order.updated\ndata: ${JSON.stringify({ order })}\n\n`);
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(pingTimer);
        clearTimeout(lifeTimer);
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // já fechado pelo cliente
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
      if (request.signal.aborted) {
        cleanup();
        return;
      }

      send("retry: 5000\n\n");
      emit(initial);

      pingTimer = setInterval(() => send(": ping\n\n"), PING_MS);
      lifeTimer = setTimeout(cleanup, MAX_LIFETIME_MS);
      pollTimer = setInterval(async () => {
        if (closed || checking) return;
        checking = true;
        try {
          if (Date.now() - lastAuthCheck >= AUTH_RECHECK_MS) {
            lastAuthCheck = Date.now();
            if (!(await accessStillValid(session.codeId, orderId))) {
              cleanup();
              return;
            }
          }
          const head = await getOrderById(orderId);
          if (!head) {
            cleanup();
            return;
          }
          if (head.revision > revision) {
            const next = await getPublicOrder(orderId);
            if (next && next.revision > revision) {
              revision = next.revision;
              emit(next);
            }
          }
        } catch {
          // Falha transitória no banco: mantém a conexão; o próximo ciclo tenta de novo.
        } finally {
          checking = false;
        }
      }, POLL_MS);
    },
    cancel() {
      closed = true;
      clearInterval(pollTimer);
      clearInterval(pingTimer);
      clearTimeout(lifeTimer);
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
