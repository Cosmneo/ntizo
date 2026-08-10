import { Hero } from "@/features/landing/ui/hero";
import {
  Categories,
  LANDING_VARS,
  PopularProviders,
  ProviderCall,
  Stories,
} from "@/features/landing/ui/sections";

import { NAVY, PAGE_TOP } from "@/features/landing/ui/palette";
import { Footer } from "@/features/landing/ui/footer";

export function LandingPage() {
  return (
    // The palette travels to the sections as local custom properties, so the
    // page keeps its own colours instead of each block re-deciding them.
    <main style={{ ...page, ...LANDING_VARS }}>
      <Hero />
      <Categories />
      <PopularProviders />
      <Stories />
      <ProviderCall />
      <Footer />
    </main>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  // Tint Blue BG, flat. The old three-stop radial gradient predates the design
  // system, which has one soft background rather than a ramp.
  background: PAGE_TOP,
  // No fontFamily here. It used to pin a system stack, which overrode Inter
  // on the whole page — the design system's body face never reached it.
  color: NAVY,
};
