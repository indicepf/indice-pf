import type { MetadataRoute } from "next";
import { supabasePublico } from "@/lib/server/supabase-public";
import { slugPrato } from "@/lib/format";

const base = "https://indicepratofeito.com.br";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const estaticas: MetadataRoute.Sitemap = ["", "/metodologia", "/planos", "/sobre"].map(
    (rota) => ({
      url: `${base}${rota}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: rota === "" ? 1 : 0.7,
    }),
  );
  // páginas por prato — se o banco falhar, o sitemap sai só com as estáticas
  try {
    const { data } = await supabasePublico().from("pratos").select("id,nome");
    const pratos: MetadataRoute.Sitemap = (data || []).map((p) => ({
      url: `${base}/prato/${slugPrato(p.id, p.nome)}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
    return [...estaticas, ...pratos];
  } catch {
    return estaticas;
  }
}
