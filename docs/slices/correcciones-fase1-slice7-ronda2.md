# Correcciones del slice 7 — ronda 2

Salida de la ronda corta de `architecture-reviewer` sobre `fase1-slice7-perfil.md` contra el
árbol con el slice 10 mergeado (`5f023d7`): un mayor y dos menores. El team-lead adopta la
opción (a) del mayor y aplica los dos menores. Las referencias se verificaron contra el árbol
antes de escribirlas; la única que cambia es la del proveedor del catálogo, que está en
`tracker-screen.tsx:56` y no en la 57.

## Contrato — team-lead

| Origen     | Hallazgo                                                                                                                                                                          | Resolución                                                                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 (mayor) | La zona es un `Select` que busca por escritura desde el inicio del texto (§6, recorrido 4); §8 anota como deuda que falta un combobox, que el 10 ya dejó en `src/components/ui/`. | Opción (a): la zona pasa a `Combobox`, armado como el `ProjectPicker`, con filtro por cualquier parte del nombre sin distinguir mayúsculas ni acentos. Los formatos siguen con `Select`. Lo que cambia en el contrato, abajo.                                             |
| m1         | §0 describe el 10 como trabajo por venir: la migración sin número fijo y `timer-bar.tsx` entre los archivos que tocan los dos.                                                    | §0 lo describe como hecho, con las referencias del árbol: `toView(row: EntryWithRefs, workspace)` en `service.ts:159` y `TrackingCatalogProvider` en `tracker-screen.tsx:56`. `timer-bar.tsx` sale de los archivos compartidos. La migración es la `0007`. Detalle abajo. |
| m2         | El encabezado no cita el ADR 0010, y §5.3 no dice qué importa `profile` ni qué clase de función es `timeSettingsOf`.                                                              | ADR 0010 entre las decisiones asociadas del encabezado. §5.3 dice que `profile` no importa nada de `time-entry` ni de `project`, y que `timeSettingsOf` es una función pura, como `weekStartOf`, y no una validación que recibe `tx`.                                     |

### Lo que M1 cambia en el contrato

Justificación del team-lead: paridad con Clockify, y la premisa de la deuda («falta la
primitiva») dejó de ser cierta con el 10.

- **§6, `preference-field.tsx`**: un `Combobox` de `src/components/ui/combobox.tsx` para la
  zona y un `Select` para cada formato. El `Combobox` sigue al `ProjectPicker`: disparador
  con rol `combobox`, popup con buscador y lista, `filter={null}` con la lista ya filtrada, y
  una tecla imprimible sobre el disparador cerrado no elige ninguna opción
  (`preventTypeahead`). Con `canEdit` en falso, la zona es texto sin disparador, como el
  `ProjectPicker` con `readOnly`.
- **`profile/components/timezone-search.ts` (nuevo) y su test**, en la lista de
  `frontend-dev`: `matchingTimeZones(zones, search)`, puro, que compara con
  `normalizeSearch` y conserva el orden recibido.
- **`normalizeSearch`** pasa de privada en `picker-model.ts:44` a exportada en
  `src/lib/text.ts`, con el mismo cuerpo. `src/lib/text.ts` ya estaba en la lista de
  `backend-dev` por `initialsOf`, y no figuraba en «Lo que no toca nadie». Se suma
  `picker-model.ts` a la lista de `backend-dev`, solo el import, en el mismo commit que el
  movimiento y dentro del primero del handshake. `profile` no depende de
  `project/components`.
- **`labels.ts`** del perfil suma `timezoneSearch` («Buscar zona horaria») y
  `timezoneEmpty` («Ninguna zona horaria coincide con la búsqueda.»).
- **§1, «Lo que el slice decide»**, suma la búsqueda por cualquier parte del nombre, que
  `parity-analyst` registra en PF-11.
- **§7**: el criterio 15 suma la búsqueda; el 17 dice que la zona es texto y que los dos
  `Select` no abren ni usan `disabled`; el test de componente afirma el `combobox` con
  `canEdit` y su ausencia sin él; `timezone-search.test.ts` cubre el filtro y
  `src/lib/text.test.ts`, `normalizeSearch`; el recorrido 4 escribe «Tokyo» para elegir
  `Asia/Tokyo` y «Buenos» para volver a la opción de Buenos Aires.
- **§8**: sale la deuda de la búsqueda desde el inicio del texto. Entra la del foco: si la
  revalidación trae `canEdit` en falso con el foco en el disparador de la zona, el
  disparador sale del árbol y el foco cae a `body`. Es la consecuencia de seguir el
  antecedente de `readOnly`, el mismo caso que tiene el selector de proyecto del rastreador
  cuando `canTrack` pasa a falso.

### Lo que m1 cambia en el contrato

- **§0, «Del 10»**: `TimeEntryView` lleva `project` y `task`, que arma
  `toView(row: EntryWithRefs, workspace)` en `time-entry/service.ts:159`;
  `TrackingCatalogProvider` de `project/components/tracking-catalog.tsx` está montado en
  `tracker-screen.tsx:56`; los archivos que tocan los dos son `service.ts`, `schema.ts`,
  `entry-row.tsx`, `manual-bar.tsx` y `tracker-screen.tsx`. El párrafo de la ronda corta
  pendiente pasa a decir que se hizo, con el enlace a este documento.
- **`timer-bar.tsx`** sale de esa lista y entra en «Lo que no toca nadie»: le pasa a
  `RunningStartEditor` la vista entera (`running={running}`). La viñeta de
  `running-start-editor.tsx` en §6 dice que su prop `running` pide `startClock` en lugar de
  `startLabel`.
- **§2** fija `drizzle/0007_user_preference.sql` y `drizzle/meta/0007_snapshot.json`; si el
  generador asigna otro número, entró otra migración en `main` y se para antes de seguir.
  §6 lista los dos archivos con su número.

## Abierto — team-lead

- **Los nombres IANA llevan `_` en lugar de espacio**: con el filtro de M1, `buenos`
  encuentra `America/Buenos_Aires` y `buenos aires` no. El contrato no fija si la búsqueda
  lee `_` como espacio.
  **Decisión del team-lead**: sí. `matchingTimeZones` lee `_` como espacio en el nombre de
  la zona, así `buenos aires` encuentra `America/Buenos_Aires`; un caso más en
  `timezone-search.test.ts`. `normalizeSearch` no cambia.
