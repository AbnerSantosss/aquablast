import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site/seo";

// /rastrear NÃO entra aqui: a página tem noindex (meta + X-Robots-Tag do next.config),
// e o Google só lê o noindex se puder rastrear a URL. Painel e API ficam fechados.
const DISALLOW = ["/admin", "/api"];

// Buscadores e bots de IA liberados de forma explícita (o objetivo é ser citado),
// com as mesmas áreas fechadas do grupo geral.
const AI_AND_SEARCH_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_AND_SEARCH_BOTS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
