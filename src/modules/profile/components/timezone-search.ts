import { normalizeSearch } from "@/lib/text";
import type { ProfileView } from "@/modules/profile/service";

type TimeZoneChoices = ProfileView["options"]["timezones"];

/**
 * Los nombres IANA separan las palabras con `_`: `buenos aires` tiene que
 * encontrar `Buenos_Aires`, y `Buenos_Aires`, tal como lo muestra el
 * disparador, también. Se aplica a la búsqueda y al nombre.
 */
function searchable(text: string): string {
  return normalizeSearch(text.replaceAll("_", " "));
}

/**
 * Las zonas cuyo nombre contiene la búsqueda, comparadas las dos con
 * `normalizeSearch` y con `_` leído como espacio de los dos lados, en el
 * orden recibido. Con la búsqueda vacía, todas. Es el único que filtra: la
 * primitiva recibe esta salida tal cual.
 */
export function matchingTimeZones(
  zones: TimeZoneChoices,
  search: string,
): TimeZoneChoices {
  const query = searchable(search);
  if (query === "") {
    return zones;
  }
  return zones.filter((zone) => searchable(zone.value).includes(query));
}
