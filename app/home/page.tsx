// Always-viewable alias of the marketing homepage. The real "/" bounces
// signed-in users to /dashboard (so the base URL lands them on their work),
// which means they can never see the landing page without signing out —
// this route renders the exact same page and is whitelisted in middleware
// as always-public, so it's viewable in either state.
export { default } from "../page";

export const metadata = {
  title: "Tender9 — Home",
};
