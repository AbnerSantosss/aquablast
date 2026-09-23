import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/site/base-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/rastrear"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
