import { normalizeSearch } from "@/lib/text";
import type { ProfileView } from "@/modules/profile/service";

type TimeZoneChoices = ProfileView["options"]["timezones"];

/** Los nombres IANA separan las palabras con `_`: `buenos aires` tiene que encontrar `Buenos_Aires`. */
function searchableName(zone: string): string {
  return normalizeSearch(zone.replaceAll("_", " "));
}

/**
 * Las zonas cuyo nombre contiene la búsqueda, comparadas las dos con
 * `normalizeSearch` y con `_` leído como espacio, en el orden recibido.
 * Con la búsqueda vacía, todas. Es el único que filtra: la primitiva recibe
 * esta salida tal cual.
 */
export function matchingTimeZones(
  zones: TimeZoneChoices,
  search: string,
): TimeZoneChoices {
  const query = normalizeSearch(search);
  if (query === "") {
    return zones;
  }
  return zones.filter((zone) => searchableName(zone.value).includes(query));
}
