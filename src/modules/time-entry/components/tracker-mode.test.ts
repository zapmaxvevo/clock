import { describe, expect, it } from "vitest";

import { parseTrackerMode, TRACKER_MODE_COOKIE, trackerModeCookie } from "./tracker-mode";

describe("parseTrackerMode", () => {
  it("lee los dos modos que existen", () => {
    expect(parseTrackerMode("timer")).toBe("timer");
    expect(parseTrackerMode("manual")).toBe("manual");
  });

  it("sin cookie arranca en modo timer", () => {
    expect(parseTrackerMode(undefined)).toBe("timer");
  });

  it("un valor desconocido no rompe la pantalla: cae en modo timer", () => {
    expect(parseTrackerMode("kiosco")).toBe("timer");
    expect(parseTrackerMode("")).toBe("timer");
    expect(parseTrackerMode("TIMER")).toBe("timer");
  });
});

describe("trackerModeCookie", () => {
  it("escribe el modo elegido con alcance de todo el sitio", () => {
    const cookie = trackerModeCookie("manual");
    expect(cookie.startsWith(`${TRACKER_MODE_COOKIE}=manual;`)).toBe(true);
    expect(cookie).toContain("path=/");
    expect(cookie).toContain("samesite=lax");
  });

  it("dura un año, así el modo sobrevive entre visitas", () => {
    expect(trackerModeCookie("timer")).toContain(`max-age=${365 * 24 * 60 * 60}`);
  });

  it("lo que escribe vuelve a leerse como el mismo modo", () => {
    const value = trackerModeCookie("manual").split(";")[0].split("=")[1];
    expect(parseTrackerMode(value)).toBe("manual");
  });
});
