import type { MetadataRoute } from "next";

// /browse and every /tenders/<id> page are public tender data (see
// middleware.ts) and are the actual SEO payoff, so they're crawlable.
// Everything that requires sign-in stays disallowed — a crawler would just
// hit a login redirect there anyway.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/browse", "/tenders"],
      disallow: [
        "/dashboard",
        "/tenders/*/workspace",
        "/workspace",
        "/fill",
        "/rfq",
        "/profiles",
        "/company",
        "/api",
      ],
    },
  };
}
