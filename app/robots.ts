import type { MetadataRoute } from "next";

// Only the public marketing pages are worth indexing — everything else
// requires sign-in and would just be a login redirect to a crawler anyway.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy"],
      disallow: ["/dashboard", "/browse", "/workspace", "/tenders", "/fill", "/rfq", "/profiles", "/company", "/api"],
    },
  };
}
