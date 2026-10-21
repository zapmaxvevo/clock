/**
 * El valor guardado de una lista cerrada: `fallback` si no hay ninguno, y si
 * está fuera de `choices`, lanza. Lo usan los services que resuelven
 * preferencias y ajustes, donde un `check` de la base impide ese caso.
 */
export function knownChoice<Choice extends string>(
  choices: readonly Choice[],
  value: string | null,
  fallback: Choice,
): Choice {
  if (value === null) {
    return fallback;
  }
  const known = choices.find((choice) => choice === value);
  if (known === undefined) {
    throw new RangeError(`Valor fuera de lista: ${value}.`);
  }
  return known;
}
