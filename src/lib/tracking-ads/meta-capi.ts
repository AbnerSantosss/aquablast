// STUB: implementado por rastreamento.
// SÓ SERVIDOR. Meta Conversions API: POST https://graph.facebook.com/v<versão>/<pixelId>/events?access_token=<ads.meta.accessToken>
// com { data: [{ event_name, event_time, event_id, action_source: "website", event_source_url, user_data: { em, ph, external_id
// (sha256Hex), fbp, fbc, client_ip_address, client_user_agent }, custom_data: { currency: "BRL", value, content_ids, num_items } }],
// test_event_code?: ads.meta.testEventCode }. Nunca logar o access token nem os dados pessoais em claro.
import type { TrackEventName } from "./types";

export interface MetaEventInput {
  eventName: TrackEventName;
  eventId: string;
  eventTime: Date;
  sourceUrl?: string;
  /** Já hasheados (sha256Hex de valor normalizado). */
  hashed: { email?: string; phone?: string; externalId?: string };
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
  valueCents?: number;
  contentIds?: string[];
  numItems?: number;
}

export async function sendMetaEvent(input: MetaEventInput): Promise<{ ok: boolean; detail?: string }> {
  void input; // STUB: implementado por rastreamento
  return { ok: false, detail: "meta-capi não implementado" };
}
