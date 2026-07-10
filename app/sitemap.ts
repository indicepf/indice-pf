import type { MetadataRoute } from "next";

const base = "https://indicepratofeito.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const rotas = ["", "/metodologia", "/planos", "/sobre"];
  return rotas.map((rota) => ({
    url: `${base}${rota}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: rota === "" ? 1 : 0.7,
  }));
}
