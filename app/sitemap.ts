import type { MetadataRoute } from "next";
import { getSupabaseAuthClient } from "@/lib/supabase-auth";

const SITE_URL = "https://tender9.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await getSupabaseAuthClient();

  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/browse`, changeFrequency: "hourly", priority: 0.9 },
  ];

  // Every open tender is its own indexable page — this is the actual SEO
  // payoff (thousands of long-tail "X tender Y province" search results)
  // instead of Google only ever seeing the one thin homepage.
  const { data: tenders } = await supabase
    .from("tenders")
    .select("id, closing_date, updated_at")
    .gte("closing_date", new Date().toISOString())
    .order("closing_date", { ascending: true })
    .limit(45_000); // well under a single sitemap's 50,000-URL cap

  for (const t of tenders ?? []) {
    entries.push({
      url: `${SITE_URL}/tenders/${t.id}`,
      lastModified: t.updated_at ?? undefined,
      changeFrequency: "daily",
      priority: 0.7,
    });
  }

  return entries;
}
