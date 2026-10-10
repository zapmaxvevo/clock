import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  ReportChart as ReportChartState,
  ReportChartBar,
} from "@/modules/report/schema";
import { bodyRows } from "@/test/markup";

import { ReportChart } from "./report-chart";

const HOUR = 3_600;

/** Del 1 de octubre en adelante, un día por barra, con estos segundos. */
function dayBars(...seconds: number[]): ReportChartBar[] {
  return seconds.map((value, index) => {
    const day = String(index + 1).padStart(2, "0");
    return {
      firstDay: `2026-10-${day}`,
      label: `día ${day}/10`,
      partial: null,
      tick: `${day}/10`,
      seconds: value,
    };
  });
}

function render(chart: ReportChartState): string {
  return renderToStaticMarkup(<ReportChart chart={chart} />);
}

/** Las columnas: el elemento con `role="img"`, sus atributos y lo que tiene adentro. */
function columns(markup: string) {
  return [...markup.matchAll(/<div role="img"([^>]*)>(.*?)<\/div>/g)].map(
    ([, attributes, inside]) => ({
      name: /aria-label="([^"]*)"/.exec(attributes)?.[1],
      tabIndex: /tabindex="([^"]*)"/.exec(attributes)?.[1],
      className: /class="([^"]*)"/.exec(attributes)?.[1] ?? "",
      inside,
    }),
  );
}

/** Las barras pintadas, con sus atributos. */
function paintedBars(markup: string): string[] {
  return [...markup.matchAll(/<div ([^>]*bg-chart-2[^>]*)>/g)].map(
    ([, attributes]) => attributes,
  );
}

/** El texto de cada marca del eje horizontal, por columna; `null` si no lleva. */
function ticks(markup: string): (string | null)[] {
  return tickSpans(markup).map((tick) => tick?.text ?? null);
}

/** Las marcas de la fila del eje, con su clase; `null` en las columnas sin marca. */
function tickSpans(markup: string) {
  const row = markup.slice(markup.indexOf("@container"));
  return [
    ...row.matchAll(
      /<div class="relative[^"]*">(?:<span class="([^"]*)">(.*?)<\/span>)?<\/div>/g,
    ),
  ].map(([, className, text]) =>
    text === undefined ? null : { text, className: className ?? "" },
  );
}

/** Los rótulos de la escala, de abajo arriba. */
function scaleLabels(markup: string): string[] {
  return [
    ...markup.matchAll(/<span class="absolute right-0[^"]*"[^>]*>(.*?)<\/span>/g),
  ].map(([, label]) => label);
}

describe("ReportChart (D-R5-7 a D-R5-9)", () => {
  it.each<[ReportChartState["granularity"], string]>([
    ["date", "Horas por día"],
    ["week", "Horas por semana"],
    ["month", "Horas por mes"],
  ])("por %s, la figura se nombra «%s» por su leyenda", (granularity, caption) => {
    const markup = render({ granularity, bars: dayBars(HOUR) });
    expect(markup).toMatch(/^<figure[^>]*><figcaption[^>]*>(.*?)<\/figcaption>/);
    expect(/<figcaption[^>]*>(.*?)<\/figcaption>/.exec(markup)?.[1]).toBe(caption);
  });

  it('la leyenda es el único nombre: ningún `role="group"` ni otro nombre del gráfico', () => {
    const markup = render({ granularity: "date", bars: dayBars(HOUR, 0, 2 * HOUR) });
    expect(markup).not.toContain('role="group"');
    expect(markup).not.toContain("aria-labelledby");
    // Los únicos `aria-label` son los de las columnas.
    expect([...markup.matchAll(/aria-label=/g)]).toHaveLength(3);
    expect(markup).not.toMatch(/<figure[^>]*aria-label/);
  });

  it("una columna por barra, también en cero, con su rol y su nombre en la columna", () => {
    const markup = render({ granularity: "date", bars: dayBars(HOUR, 0, 1_800) });
    expect(columns(markup).map(({ name }) => name)).toEqual([
      "día 01/10: 1:00",
      "día 02/10: 0:00",
      "día 03/10: 0:30",
    ]);
  });

  it("el nombre lleva «solo …» si la barra no cuenta su semana o su mes entero", () => {
    const markup = render({
      granularity: "week",
      bars: [
        {
          firstDay: "2026-09-30",
          label: "28/09 – 04/10",
          partial: "30/09 – 04/10",
          tick: "30/09",
          seconds: 3 * HOUR + 15 * 60,
        },
        {
          firstDay: "2026-10-05",
          label: "05/10 – 11/10",
          partial: null,
          tick: "05/10",
          seconds: 0,
        },
      ],
    });
    expect(columns(markup).map(({ name }) => name)).toEqual([
      "28/09 – 04/10 solo 30/09 – 04/10: 3:15",
      "05/10 – 11/10: 0:00",
    ]);
  });

  it("una sola parada de tabulación, en la primera columna (§5.3)", () => {
    const markup = render({ granularity: "date", bars: dayBars(0, HOUR, 0, HOUR) });
    expect(columns(markup).map(({ tabIndex }) => tabIndex)).toEqual([
      "0",
      "-1",
      "-1",
      "-1",
    ]);
  });

  it("la columna es de alto completo; la barra pintada va adentro, sin rol, nombre ni tabulación", () => {
    const markup = render({ granularity: "date", bars: dayBars(HOUR, 2 * HOUR) });
    expect(columns(markup)).toHaveLength(2);
    for (const column of columns(markup)) {
      expect(column.className).toContain("h-full");
      expect(column.className).not.toContain("bg-chart-2");
    }
    const painted = paintedBars(markup);
    expect(painted).toHaveLength(2);
    for (const bar of painted) {
      expect(bar).not.toMatch(/role=|aria-label=|tabindex=/);
    }
  });

  it("con el foco de teclado, el contorno va hacia adentro y la barra se aparta de él (P6)", () => {
    const markup = render({ granularity: "date", bars: dayBars(HOUR, 0) });
    const [withHours, zero] = columns(markup);
    for (const column of [withHours, zero]) {
      expect(column?.className).toContain("focus-visible:-outline-offset-2");
    }
    // 2 px de contorno y 1 px del fondo de la columna activa entre él y la barra.
    expect(withHours?.inside).toContain("group-focus-visible:mx-[3px]");
    expect(withHours?.inside).toContain("group-focus-visible:mb-[3px]");
    expect(withHours?.inside).toContain("group-focus-visible:max-h-[calc(100%-6px)]");
    expect(withHours?.className).toMatch(/(^| )group( |$)/);
  });

  it("una barra en cero no se pinta; una con horas lleva su alto y el mínimo", () => {
    // El techo es de 2:00: 30 s son el 0,4 %, que sin el mínimo no se verían.
    const markup = render({ granularity: "date", bars: dayBars(0, 30, 2 * HOUR) });
    const [zero, tiny, full] = columns(markup);
    expect(zero?.inside).toBe("");
    expect(tiny?.inside).toContain("min-h-0.5");
    expect(tiny?.inside).toContain(`height:${(30 / (2 * HOUR)) * 100}%`);
    expect(full?.inside).toContain("min-h-0.5");
    expect(full?.inside).toContain("height:100%");
  });

  it("los rótulos de la escala, de 0:00 al techo", () => {
    const markup = render({ granularity: "date", bars: dayBars(HOUR, 7.5 * HOUR) });
    expect(scaleLabels(markup)).toEqual(["0:00", "2:00", "4:00", "6:00", "8:00"]);
  });

  it("las marcas solo en las columnas de `tickIndexesOf`", () => {
    const markup = render({
      granularity: "date",
      bars: dayBars(HOUR, 0, 0, 0, 0, 0, 0, HOUR),
    });
    expect(ticks(markup)).toEqual([
      "01/10",
      null,
      "03/10",
      null,
      "05/10",
      null,
      "07/10",
      null,
    ]);
  });

  it("con el área angosta se ven solo las de `narrowTickIndexesOf`; el resto, desde 24rem", () => {
    const markup = render({
      granularity: "date",
      bars: dayBars(...Array.from({ length: 31 }, () => HOUR)),
    });
    const shown = tickSpans(markup).filter((tick) => tick !== null);
    expect(shown.map(({ text }) => text)).toEqual([
      "01/10",
      "06/10",
      "11/10",
      "16/10",
      "21/10",
      "26/10",
      "31/10",
    ]);
    expect(
      shown
        .filter(({ className }) => !className.includes("hidden"))
        .map(({ text }) => text),
    ).toEqual(["01/10", "11/10", "21/10", "31/10"]);
    for (const { className } of shown.filter(({ text }) =>
      ["06/10", "16/10", "26/10"].includes(text),
    )) {
      expect(className).toContain("hidden @min-[24rem]:block");
    }
    expect(markup).toMatch(/class="[^"]*@container[^"]*"/);
  });

  it("la marca de la primera va al inicio y la de la última al final", () => {
    const markup = render({ granularity: "date", bars: dayBars(HOUR, 0, HOUR) });
    expect(markup).toMatch(/<span class="[^"]*left-0[^"]*">01\/10<\/span>/);
    expect(markup).toMatch(/<span class="[^"]*-translate-x-1\/2[^"]*">02\/10<\/span>/);
    expect(markup).toMatch(/<span class="[^"]*right-0[^"]*">03\/10<\/span>/);
  });

  it("la línea del valor empieza vacía y oculta para los lectores", () => {
    const markup = render({ granularity: "date", bars: dayBars(HOUR) });
    expect(markup).toMatch(/<p aria-hidden="true"[^>]*><\/p>/);
  });

  it("la tabla de datos, cerrada, después de las columnas, con una fila por barra", () => {
    const markup = render({
      granularity: "week",
      bars: [
        {
          firstDay: "2026-09-30",
          label: "28/09 – 04/10",
          partial: "30/09 – 04/10",
          tick: "30/09",
          seconds: HOUR,
        },
        {
          firstDay: "2026-10-05",
          label: "05/10 – 11/10",
          partial: null,
          tick: "05/10",
          seconds: 0,
        },
      ],
    });
    expect(markup).toMatch(
      /<details[^>]*><summary[^>]*>Ver los datos del gráfico<\/summary>/,
    );
    expect(markup).not.toMatch(/<details[^>]*open/);
    expect(markup.indexOf("<details")).toBeGreaterThan(markup.lastIndexOf('role="img"'));
    expect(markup).toMatch(/<th scope="col"[^>]*>Semana<\/th>/);
    expect(markup).toMatch(/<th scope="col"[^>]*>Duración<\/th>/);
    expect(bodyRows(markup.slice(markup.indexOf("<details")))).toEqual([
      ["28/09 – 04/10 solo 30/09 – 04/10", "1:00"],
      ["05/10 – 11/10", "0:00"],
    ]);
  });

  it("una sola barra lleva el ancho tope; con más, no", () => {
    const one = columns(render({ granularity: "date", bars: dayBars(HOUR) }));
    expect(one).toHaveLength(1);
    expect(one[0]?.className).toContain("max-w-12");
    const two = columns(render({ granularity: "date", bars: dayBars(HOUR, HOUR) }));
    expect(two).toHaveLength(2);
    for (const column of two) {
      expect(column.className).not.toContain("max-w-12");
    }
  });
});
