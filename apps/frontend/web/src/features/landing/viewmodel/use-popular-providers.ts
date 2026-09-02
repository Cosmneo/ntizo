import { useQuery } from "@tanstack/react-query";
import { landingProviderQueries } from "../data/provider.repository";
import { useLocale } from "./use-locale";

/** The verified, best-scored businesses the home page puts under "popular". */
export function usePopularProviders(limit: number) {
  return useQuery(landingProviderQueries.popular(useLocale(), limit));
}
