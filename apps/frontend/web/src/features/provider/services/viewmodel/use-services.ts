import { useQuery } from "@tanstack/react-query";
import { serviceQueries } from "../data/service.repository";

/** A workspace's own services, whatever their status. */
export function useServices(providerId: string | undefined) {
  return useQuery(serviceQueries.mine(providerId ?? ""));
}
