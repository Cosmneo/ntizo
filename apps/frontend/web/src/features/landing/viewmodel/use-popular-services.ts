import { useQuery } from "@tanstack/react-query";
import { landingServiceQueries } from "../data/service.repository";
import { useLocale } from "./use-locale";

/** The priced services the home page leads with. */
export function usePopularServices(limit: number) {
  return useQuery(landingServiceQueries.popular(useLocale(), limit));
}
