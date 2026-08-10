import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { loadMaps, type MapsLoadResult } from "@/shared/lib/google-maps";

export interface PickedPlace {
  lat: number;
  lng: number;
  city?: string;
  district?: string;
  street?: string;
  postalCode?: string;
  country?: string;
}

/** Maputo. Where the map opens when there is nothing better to centre on. */
const DEFAULT_CENTRE = { lat: -25.9655, lng: 32.5832 };

/**
 * Pulls the fields we store out of a geocoder result.
 *
 * Google's components are a flat list of typed parts rather than a shaped
 * address, and the type that means "city" differs by country — `locality` in
 * most places, `administrative_area_level_2` where a municipality carries the
 * name. Both are read, nearest first.
 */
function parseComponents(
  components: readonly google.maps.GeocoderAddressComponent[],
): Omit<PickedPlace, "lat" | "lng"> {
  const find = (...types: string[]) =>
    components.find((c) => types.some((t) => c.types.includes(t)));

  const streetNumber = find("street_number")?.long_name;
  const route = find("route")?.long_name;

  return {
    ...(route ? { street: [route, streetNumber].filter(Boolean).join(", ") } : {}),
    ...(find("locality", "administrative_area_level_2")?.long_name
      ? { city: find("locality", "administrative_area_level_2")!.long_name }
      : {}),
    ...(find("sublocality", "neighborhood")?.long_name
      ? { district: find("sublocality", "neighborhood")!.long_name }
      : {}),
    ...(find("postal_code")?.long_name
      ? { postalCode: find("postal_code")!.long_name }
      : {}),
    ...(find("country")?.short_name ? { country: find("country")!.short_name } : {}),
  };
}

/**
 * A map with a pin the provider can drag.
 *
 * Two jobs, and the second is the reason it earns its space: it fixes a point
 * so a customer can be shown how far away someone is, and dropping the pin
 * fills the address fields from what Google knows about that point — which is
 * the difference between typing five fields and correcting one.
 *
 * Renders nothing at all without an API key. That is a designed state, not a
 * failure: the fields below work on their own, a Mozambican address is often a
 * landmark rather than a coordinate, and an empty grey box captioned "map
 * unavailable" would be worse than no map.
 */
export function LocationMap({
  country,
  onPick,
}: {
  /** Biases the map's opening view and the geocoder's results. */
  country: string;
  onPick: (place: PickedPlace) => void;
}) {
  const { t } = useTranslation("onboarding");
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<MapsLoadResult | null>(null);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMaps().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state?.status !== "ready" || !containerRef.current) return;

    const map = new state.maps.Map(containerRef.current, {
      center: DEFAULT_CENTRE,
      zoom: 12,
      ...(state.mapId ? { mapId: state.mapId } : {}),
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
    });

    const marker = new state.marker.AdvancedMarkerElement({ map, gmpDraggable: true });
    const geocoder = state.geocoding ? new state.geocoding.Geocoder() : null;

    async function place(position: google.maps.LatLngLiteral) {
      marker.position = position;
      setPicked(position);

      if (!geocoder) {
        // No reverse geocoding: the coordinates are still worth keeping, and
        // the fields stay as the provider typed them.
        onPick(position);
        return;
      }
      try {
        const { results } = await geocoder.geocode({ location: position });
        const first = results[0];
        onPick(
          first ? { ...position, ...parseComponents(first.address_components) } : position,
        );
      } catch {
        // A failed lookup must not lose the pin the user just dropped.
        onPick(position);
      }
    }

    const clickListener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) void place(e.latLng.toJSON());
    });
    const dragListener = marker.addListener("dragend", () => {
      const position = marker.position;
      if (position) void place(position as google.maps.LatLngLiteral);
    });

    return () => {
      clickListener.remove();
      dragListener.remove();
      marker.map = null;
    };
    // `onPick` is a fresh closure on every render; re-running this would tear
    // the map down and lose the pin between keystrokes in the fields below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, country]);

  if (!state || state.status !== "ready") return null;

  return (
    <div className="sm:col-span-2">
      <div
        ref={containerRef}
        role="application"
        aria-label={t("location.mapLabel")}
        className="h-64 w-full overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--color-border)]"
      />
      <p className="type-caption mt-2 flex items-start gap-1.5 text-[var(--color-muted-foreground)]">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {picked ? t("location.mapPicked") : t("location.mapHint")}
      </p>
    </div>
  );
}
