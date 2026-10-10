/** La escala del eje vertical, en segundos (D-R5-8). */
export type ChartScale = {
  readonly step: number;
  /** El menor múltiplo de `step` que cubre la barra más alta; como mínimo, un paso. */
  readonly ceiling: number;
  /** 0, un paso, dos… hasta `ceiling`: de dos a cinco. */
  readonly lines: readonly number[];
};

/** Cuatro pasos cubren la barra más alta: así las líneas son cinco como mucho. */
const STEPS_TO_COVER = 4;

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** Los pasos de menos de una hora; desde la hora, 1, 2 y 5 por cada potencia de diez. */
const SUB_HOUR_STEPS = [15 * MINUTE, 30 * MINUTE];
const STEP_MULTIPLIERS = [1, 2, 5];

/** Hasta siete marcas en el eje horizontal (D-R5-8). */
const MAX_TICKS = 7;

/**
 * D-R5-8: el paso es el menor de 15 min, 30 min, 1 h, 2 h, 5 h, 10 h… tal que
 * cuatro pasos cubran la barra más alta, sin tope.
 */
export function chartScaleOf(bars: readonly { readonly seconds: number }[]): ChartScale {
  const highest = Math.max(0, ...bars.map((bar) => bar.seconds));
  const step = stepFor(highest);
  const ceiling = Math.max(1, Math.ceil(highest / step)) * step;
  const lines = Array.from({ length: ceiling / step + 1 }, (_, index) => index * step);
  return { step, ceiling, lines };
}

function stepFor(highest: number): number {
  const covers = (step: number) => step * STEPS_TO_COVER >= highest;
  const subHour = SUB_HOUR_STEPS.find(covers);
  if (subHour !== undefined) {
    return subHour;
  }
  for (let power = HOUR; ; power *= 10) {
    const step = STEP_MULTIPLIERS.map((multiplier) => multiplier * power).find(covers);
    if (step !== undefined) {
      return step;
    }
  }
}

/** Las columnas que llevan marca: cada `ceil(n / 7)` desde la primera (D-R5-8). */
export function tickIndexesOf(count: number): readonly number[] {
  const every = Math.ceil(count / MAX_TICKS);
  return Array.from({ length: Math.ceil(count / every) }, (_, index) => index * every);
}

/**
 * Las que se ven con el área angosta: una de cada dos de `tickIndexesOf`,
 * desde la primera. Con el paso doble son cuatro como mucho, y siempre de las
 * mismas columnas que las siete.
 */
export function narrowTickIndexesOf(count: number): readonly number[] {
  return tickIndexesOf(count).filter((_, position) => position % 2 === 0);
}

/**
 * La de la primera columna empieza en su borde y la de la última termina en el
 * suyo, así ninguna sale de la caja; el resto, y la de una sola, centradas.
 */
export function tickAlignOf(index: number, count: number): "start" | "center" | "end" {
  if (count === 1) {
    return "center";
  }
  if (index === 0) {
    return "start";
  }
  return index === count - 1 ? "end" : "center";
}

/** El alto de la barra en porcentaje del techo; el mínimo de una con horas lo pone el estilo. */
export function barHeightPercent(seconds: number, scale: ChartScale): number {
  return (seconds / scale.ceiling) * 100;
}

/**
 * D-R5-9: la columna que recibe el foco con `key`, sin dar la vuelta; `null`
 * si la tecla no mueve el foco y debe seguir su camino.
 */
export function nextBarIndex(index: number, key: string, count: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return Math.min(index + 1, count - 1);
    case "ArrowLeft":
    case "ArrowUp":
      return Math.max(index - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** D-R5-9: la del puntero si hay; si no, la del foco; si no, ninguna. */
export function activeBarIndex(
  hovered: number | null,
  focused: number | null,
): number | null {
  return hovered ?? focused;
}
