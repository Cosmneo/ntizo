import { Hero } from "@/features/landing/ui/hero";
import { CategoryGrid } from "@/features/landing/ui/category-grid";
import { PopularServices } from "@/features/landing/ui/popular-services";
import { HowItWorks } from "@/features/landing/ui/how-it-works";
import { VerifiedProviders } from "@/features/landing/ui/verified-providers";
import { CustomerReviews } from "@/features/landing/ui/customer-reviews";
import { ProviderBand } from "@/features/landing/ui/provider-band";
import { Footer } from "@/features/landing/ui/footer";

/**
 * The customer home page.
 *
 * White, on the design system's own tokens. It carried its palette to its
 * sections as local custom properties because it painted itself a tinted blue
 * nothing else on the site used; every colour here is now a token every other
 * page shares, so there is nothing to carry.
 *
 * The order is an argument: what we sell, what you can browse, what it costs,
 * how it works, who does it, what they were like, and then — once — the offer
 * to the person who might do the work.
 */
export function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      <Hero />
      <CategoryGrid />
      <PopularServices />
      <HowItWorks />
      <VerifiedProviders />
      <CustomerReviews />
      <ProviderBand />
      <Footer />
    </main>
  );
}
