import { describe, expect, it } from "vitest";

import { matchingTimeZones } from "./timezone-search";

const zones = [
  { value: "America/Bogota", example: "UTC−05:00" },
  { value: "America/Buenos_Aires", example: "UTC−03:00" },
  { value: "Asia/Kathmandu", example: "UTC+05:45" },
  { value: "Asia/Tokyo", example: "UTC+09:00" },
  { value: "Europe/Madrid", example: "UTC+02:00" },
] as const;

function namesFor(search: string): string[] {
  return matchingTimeZones(zones, search).map((zone) => zone.value);
}

describe("matchingTimeZones", () => {
  it("no distingue mayúsculas", () => {
    expect(namesFor("tokyo")).toEqual(["Asia/Tokyo"]);
    expect(namesFor("TOKYO")).toEqual(["Asia/Tokyo"]);
  });

  it("encuentra por cualquier parte del nombre", () => {
    expect(namesFor("buenos")).toEqual(["America/Buenos_Aires"]);
    expect(namesFor("asia/")).toEqual(["Asia/Kathmandu", "Asia/Tokyo"]);
  });

  it("lee el `_` del nombre como espacio", () => {
    expect(namesFor("buenos aires")).toEqual(["America/Buenos_Aires"]);
  });

  it("lee el `_` de la búsqueda como espacio, como en el nombre", () => {
    expect(namesFor("Buenos_Aires")).toEqual(["America/Buenos_Aires"]);
    expect(namesFor("america/buenos_aires")).toEqual(["America/Buenos_Aires"]);
  });

  it("no distingue acentos", () => {
    expect(namesFor("Bogotá")).toEqual(["America/Bogota"]);
  });

  it("ignora los espacios en los extremos de la búsqueda", () => {
    expect(namesFor("  madrid ")).toEqual(["Europe/Madrid"]);
  });

  it("con la búsqueda vacía devuelve todas, en el orden recibido", () => {
    expect(namesFor("")).toEqual(zones.map((zone) => zone.value));
    expect(namesFor("   ")).toEqual(zones.map((zone) => zone.value));
  });

  it("sin coincidencias devuelve una lista vacía", () => {
    expect(namesFor("atlantis")).toEqual([]);
  });

  it("conserva el ejemplo de cada zona", () => {
    expect(matchingTimeZones(zones, "kath")).toEqual([
      { value: "Asia/Kathmandu", example: "UTC+05:45" },
    ]);
  });
});
