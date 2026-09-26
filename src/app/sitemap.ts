import type { MetadataRoute } from "next";
import { absoluteUrl, CONTENT_UPDATED_AT, HOME_URL, RETURNS_UPDATED_AT, RETURNS_URL } from "@/lib/site/seo";

// Páginas indexáveis: a home e a política de trocas. /rastrear tem noindex e
// /admin e /api são privados.
// Cada `url` é igual ao href da canonical renderizada da página; `lastModified` é a
// data real da última mudança de conteúdo (não a hora do build, que o Google aprende a ignorar).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: HOME_URL,
      lastModified: CONTENT_UPDATED_AT,
      changeFrequency: "weekly",
      priority: 1,
      images: [
        absoluteUrl("/produto-azul.webp"),
        absoluteUrl("/produto-vermelho.webp"),
        absoluteUrl("/produto-preto.webp"),
      ],
    },
    {
      url: RETURNS_URL,
      lastModified: RETURNS_UPDATED_AT,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
