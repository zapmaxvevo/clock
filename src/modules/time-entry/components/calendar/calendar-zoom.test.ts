import { describe, expect, it } from "vitest";

import {
  CALENDAR_ZOOM_COOKIE,
  calendarZoomCookie,
  parseCalendarZoom,
  zoomedIn,
  zoomedOut,
} from "./calendar-zoom";

describe("parseCalendarZoom", () => {
  it("lee los cuatro tamaños de franja", () => {
    expect(parseCalendarZoom("60")).toBe(60);
    expect(parseCalendarZoom("30")).toBe(30);
    expect(parseCalendarZoom("15")).toBe(15);
    expect(parseCalendarZoom("5")).toBe(5);
  });

  it("sin cookie arranca con franjas de una hora", () => {
    expect(parseCalendarZoom(undefined)).toBe(60);
  });

  it("un valor desconocido no rompe la pantalla: cae en franjas de una hora", () => {
    expect(parseCalendarZoom("10")).toBe(60);
    expect(parseCalendarZoom("")).toBe(60);
    expect(parseCalendarZoom("05")).toBe(60);
    expect(parseCalendarZoom("5.0")).toBe(60);
  });
});

describe("calendarZoomCookie", () => {
  it("escribe el zoom elegido con alcance de todo el sitio", () => {
    const cookie = calendarZoomCookie(15);
    expect(cookie.startsWith(`${CALENDAR_ZOOM_COOKIE}=15;`)).toBe(true);
    expect(cookie).toContain("path=/");
    expect(cookie).toContain("samesite=lax");
  });

  it("dura un año, así el zoom sobrevive entre visitas", () => {
    expect(calendarZoomCookie(30)).toContain(`max-age=${365 * 24 * 60 * 60}`);
  });

  it("lo que escribe vuelve a leerse como el mismo zoom", () => {
    for (const zoom of [60, 30, 15, 5] as const) {
      const value = calendarZoomCookie(zoom).split(";")[0].split("=")[1];
      expect(parseCalendarZoom(value)).toBe(zoom);
    }
  });
});

describe("zoomedIn y zoomedOut", () => {
  it("«Acercar» achica la franja de 60 a 30, 15 y 5 minutos", () => {
    expect(zoomedIn(60)).toBe(30);
    expect(zoomedIn(30)).toBe(15);
    expect(zoomedIn(15)).toBe(5);
  });

  it("«Alejar» la agranda de 5 a 15, 30 y 60 minutos", () => {
    expect(zoomedOut(5)).toBe(15);
    expect(zoomedOut(15)).toBe(30);
    expect(zoomedOut(30)).toBe(60);
  });

  it("en cada extremo no hay a dónde ir", () => {
    expect(zoomedIn(5)).toBeNull();
    expect(zoomedOut(60)).toBeNull();
  });
});
