import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID } from "@/shared/lib/env";

export type MapsReady = {
  status: "ready";
  maps: google.maps.MapsLibrary;
  marker: google.maps.MarkerLibrary;
  /**
   * Turns a dropped pin back into an address.
   *
   * Optional so callers guard it: a test double of the loader may omit it, and
   * a caller that only needs coordinates has no use for it.
   */
  geocoding?: google.maps.GeocodingLibrary;
  mapId: string | undefined;
};

export type MapsUnavailable = {
  status: "unavailable";
  reason: "missing-api-key" | "load-failed";
};

export type MapsLoadResult = MapsReady | MapsUnavailable;

let pending: Promise<MapsLoadResult> | null = null;

/**
 * Loads the Maps libraries once per page.
 *
 * "No key" is a first-class result rather than a thrown error. The location
 * step works without a map — the fields are all there and a Mozambican address
 * is often a landmark rather than a coordinate — so a missing key downgrades
 * the screen instead of breaking it. That is also what lets the feature ship
 * before anyone has provisioned a Google project.
 *
 * The promise is memoised: two components mounting at once would otherwise
 * fetch the SDK twice, and the loader throws when configured with a second key.
 */
export function loadMaps(): Promise<MapsLoadResult> {
  if (pending) return pending;

  if (!GOOGLE_MAPS_API_KEY) {
    pending = Promise.resolve({ status: "unavailable", reason: "missing-api-key" });
    return pending;
  }

  setOptions({ key: GOOGLE_MAPS_API_KEY, v: "weekly" });

  pending = (async (): Promise<MapsLoadResult> => {
    try {
      const [maps, marker, geocoding] = await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
        // Reverse geocoding is what fills the fields from a dropped pin. If it
        // alone fails the map is still worth showing, so it is caught apart.
        importLibrary("geocoding").catch(() => undefined),
      ]);
      return {
        status: "ready",
        maps,
        marker,
        ...(geocoding ? { geocoding } : {}),
        mapId: GOOGLE_MAPS_MAP_ID || undefined,
      };
    } catch {
      // Reset, so a network blip does not poison every later mount.
      pending = null;
      return { status: "unavailable", reason: "load-failed" };
    }
  })();

  return pending;
}

/** Test seam: forget the memoised load. */
export function __resetMapsForTests(): void {
  pending = null;
}
