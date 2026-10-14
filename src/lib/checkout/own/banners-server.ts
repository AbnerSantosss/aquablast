import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkoutBanners, DEFAULT_COMPANY_ID } from "@/db/schema";
import { bannerDefaultAlt, bannerImageUrl, isBannerDevice, isBannerProduct, type AdminBannerArt, type AdminBannerMap, type BannerDevice, type BannerMap, type BannerProduct } from "./banners";

/**
 * Leitura das artes de banner (tabela `checkout_banners`), sempre SEM os bytes: quem serve o arquivo é
 * /api/checkout/banner-image/[id]. As consultas usam db.select com o objeto da tabela, não db.query.*:
 * o `next dev` guarda o schema do Drizzle na memória e uma tabela nova só entraria em db.query depois de
 * reiniciar o servidor (wiki/decisoes/armadilhas.md).
 */

/** Artes de UMA empresa (multiempresa, 0013). Padrão: AquaBlast. */
async function rows(companyId: string) {
  return db
    .select({
      id: checkoutBanners.id,
      product: checkoutBanners.product,
      device: checkoutBanners.device,
      alt: checkoutBanners.alt,
      mime: checkoutBanners.mime,
      width: checkoutBanners.width,
      height: checkoutBanners.height,
      sizeBytes: sql<number>`octet_length(${checkoutBanners.bytes})`.mapWith(Number),
    })
    .from(checkoutBanners)
    .where(eq(checkoutBanners.companyId, companyId));
}

/** Artes do painel, por produto e dispositivo. Linha com produto ou dispositivo fora das listas é ignorada. */
export async function getAdminCheckoutBanners(companyId: string = DEFAULT_COMPANY_ID): Promise<AdminBannerMap> {
  const map: AdminBannerMap = {};
  for (const row of await rows(companyId)) {
    if (!isBannerProduct(row.product) || !isBannerDevice(row.device)) continue;
    const customAlt = row.alt.trim();
    const art: AdminBannerArt = {
      id: row.id,
      url: bannerImageUrl(row.id),
      width: row.width,
      height: row.height,
      alt: customAlt || bannerDefaultAlt(row.product),
      customAlt,
      mime: row.mime,
      sizeBytes: row.sizeBytes,
    };
    map[row.product] = { ...map[row.product], [row.device]: art };
  }
  return map;
}

/** Artes que o checkout usa, por produto e dispositivo. `alt` já vem resolvido: o do painel ou o padrão do produto. */
export async function getCheckoutBanners(companyId: string = DEFAULT_COMPANY_ID): Promise<BannerMap> {
  const admin = await getAdminCheckoutBanners(companyId);
  const map: BannerMap = {};
  for (const [product, devices] of Object.entries(admin) as [BannerProduct, AdminBannerMap[BannerProduct]][]) {
    for (const [device, art] of Object.entries(devices ?? {}) as [BannerDevice, AdminBannerArt][]) {
      map[product] = { ...map[product], [device]: { id: art.id, url: art.url, width: art.width, height: art.height, alt: art.alt } };
    }
  }
  return map;
}
