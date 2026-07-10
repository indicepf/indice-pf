import type { MetadataRoute } from "next";

const base = "https://indicepratofeito.com.br";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/perfil",
        "/painel",
        "/meus-envios",
        "/configuracoes",
        "/assinar",
        "/plano",
        "/completar-perfil",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
