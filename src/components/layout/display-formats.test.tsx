import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DisplayFormats } from "@/server/time";

import { DisplayFormatsProvider, useDisplayFormats } from "./display-formats";

/** Dibuja lo que devuelve el hook, para leerlo en el marcado. */
function FormatsProbe() {
  const { time, date } = useDisplayFormats();
  return <output>{`${time} ${date}`}</output>;
}

const base: DisplayFormats = { time: "24h", date: "dd/MM/yyyy", duration: "compact" };
const screen: DisplayFormats = { time: "12h", date: "yyyy-MM-dd", duration: "compact" };

describe("useDisplayFormats", () => {
  it("lanza sin proveedor", () => {
    expect(() => renderToStaticMarkup(<FormatsProbe />)).toThrow(
      "useDisplayFormats necesita un DisplayFormatsProvider.",
    );
  });

  it("devuelve los formatos del proveedor", () => {
    const markup = renderToStaticMarkup(
      <DisplayFormatsProvider formats={screen}>
        <FormatsProbe />
      </DisplayFormatsProvider>,
    );

    expect(markup).toBe("<output>12h yyyy-MM-dd</output>");
  });

  it("con dos proveedores anidados gana el más cercano", () => {
    const markup = renderToStaticMarkup(
      <DisplayFormatsProvider formats={base}>
        <FormatsProbe />
        <DisplayFormatsProvider formats={screen}>
          <FormatsProbe />
        </DisplayFormatsProvider>
      </DisplayFormatsProvider>,
    );

    expect(markup).toBe("<output>24h dd/MM/yyyy</output><output>12h yyyy-MM-dd</output>");
  });
});
