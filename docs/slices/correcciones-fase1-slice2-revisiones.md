# Correcciones del slice 2 — revisiones transversales

Salida de las cuatro revisiones sobre la rama integrada: seguridad (aprobado),
código, tests y paridad (cambios requeridos). Abajo va cada hallazgo con la
resolución decidida y el dueño. No hace falta volver a discutirlas; si alguna
resulta incorrecta al implementarla, se avisa en vez de aplicarla a medias.

Fuera de esta ronda: `npm audit` en CI (preexistente en `main`, decisión
pendiente del equipo) y el rol de Neon con permisos mínimos para
`E2E_DATABASE_URL` (checklist de puesta en marcha).

## Contrato entre backend y frontend que cambia

`getTrackerState(actor, workspace)` recibe `{ timezone, createdAt }` del
workspace de la sesión, igual que `createManualEntry`, y `TrackerState` suma dos
campos calculados por el service:

- `todayKey: string`: el día de hoy en la zona del workspace.
- `minDayKey: string`: el día local de creación del workspace, calculado por la
  misma función que usa la validación `beforeWorkspace`
  (`workspaceFloorDayKey(workspace)`).

`tracker-screen.tsx` deja de importar `dayKey` y de recibir
`workspaceCreatedAt`; `page.tsx` pasa el workspace. Backend cambia service y
schema; frontend cambia `tracker-screen.tsx` y `page.tsx`.

## Backend — `backend-dev`

Archivos: `src/server/time/`, `src/modules/time-entry/{schema,service,repository}.ts`,
`components/manual-draft.ts` y su test, y los tests de integración.

| Origen    | Hallazgo                                                        | Resolución                                                                                                                                                                                               |
| --------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código M1 | TT-72 escrito dos veces y por comparación de cadenas            | `crossesMidnight(start, end): boolean` en `src/server/time`, basada en `clockToMinutes`; la usan `service.ts` y `manual-draft.ts`.                                                                       |
| Código M2 | `schema.ts` copia la regex de `CLOCK`                           | `isClock(text)` en `src/server/time`; el esquema usa `.refine`, como `dayKeyInput`.                                                                                                                      |
| Código M3 | `date-field.tsx` hace aritmética de fechas                      | Exportar `toDayKey(date: CivilDate)` (backend). El componente lo usa (frontend).                                                                                                                         |
| Código M4 | El piso del workspace se calcula en un componente               | Ver «Contrato entre backend y frontend que cambia».                                                                                                                                                      |
| Código m6 | `instantFromLocal` reparsea la hora; `extraDays` usa un literal | Usar `clockToMinutes`; `DAY_MS` en `extraDays`.                                                                                                                                                          |
| Código m8 | Arnés de mocks duplicado en dos archivos                        | Los casos de `manual-entry.integration.test.ts` pasan a `actions.integration.test.ts`, que tiene el arnés que registra revalidaciones; se suma un caso de revalidación con error de `createManualEntry`. |
| Seg. m-1  | Año 10000 UTC llega a Postgres y vuelve como `unexpected`       | Después de calcular los instantes, `getUTCFullYear() > 9999` → `validation` con `invalidDate`. Caso de integración con Buenos Aires y `9999-12-31 23:00–23:30`.                                          |
| Seg. m-2  | `\u0000` en la descripción llega a Postgres                     | `.refine` en `description` de `schema.ts`, con mensaje de validación; cubre las cuatro actions. Test de esquema.                                                                                         |
| Tests M1  | Nada protege el `outsideWindow` del paso 8                      | Caso: entrada futura (10-10) con `now` 10-02, se crea una del 09-04; `outsideWindow === false` y `getTrackerState` incluye `2026-09-04`. Verificar que la mutación a `findLatestClosed` lo hace fallar.  |
| Tests m1  | El `afterAll` deja `TZ="undefined"`                             | `delete process.env.TZ` cuando no estaba definida.                                                                                                                                                       |
| Tests m2  | `manual-draft.test.ts` usa la zona del host                     | Usar `Asia/Tokyo` (ni UTC ni la del host).                                                                                                                                                               |
| Tests m3  | Comentario de duración que no demuestra lo que dice             | Ajustar el comentario o la afirmación.                                                                                                                                                                   |
| Tests m4  | El criterio 8 pide los dos instantes y se afirma uno            | Afirmar también `startedAt`.                                                                                                                                                                             |

## Frontend — `frontend-dev`

Archivos: `src/modules/time-entry/components/` (salvo `manual-draft.ts`),
`src/components/ui/{button,calendar}.tsx`, `src/app/(app)/page.tsx`.

| Origen      | Hallazgo                                                           | Resolución                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paridad M-A | «Agregar» se traga el primer clic                                  | `aria-disabled` en vez de `disabled` para el caso `tooShort`, y salida temprana en `handleAdd` si el borrador no es válido. Verificar que el blur se procesa antes del click. |
| Paridad M-B | El calendario no se maneja con teclado                             | `ref={ref}` al `<Button>` de `CalendarDayButton`.                                                                                                                             |
| Paridad M-1 | El conmutador cambia de lugar según el modo                        | Sacarlo de la fila que hace `flex-wrap`: queda a la derecha en los dos modos.                                                                                                 |
| Paridad M-2 | El foco se pierde al conmutar y al agregar                         | El conmutador se monta en `TrackerBar` fuera del condicional; después del `reset` el foco vuelve a la descripción.                                                            |
| Paridad M-3 | «Modo manual» presionado con la barra del timer                    | `ModeSwitch` recibe el modo efectivo (`isManual ? "manual" : "timer"`); la cookie no se toca.                                                                                 |
| Paridad M-4 | El calendario marca «hoy» del navegador                            | `today={civilDate(todayKey)}` en el `<Calendar>`.                                                                                                                             |
| Paridad M-5 | Nombres accesibles del calendario en inglés                        | `es` de `react-day-picker/locale`.                                                                                                                                            |
| Paridad M-6 | Pestaña vieja: el rechazo por TT-30 se pierde con lo tecleado      | El borrador manual vive en `TrackerBar` y sobrevive al cambio de modo forzado.                                                                                                |
| Código M3   | Aritmética de fechas en `date-field.tsx`                           | `toDayKey({ year, month, day })` del día elegido; sale `MS_PER_DAY`; `dayKeyLabel` se calcula una vez.                                                                        |
| Código M4   | Piso en el componente                                              | Consumir `state.todayKey` y `state.minDayKey`; `page.tsx` pasa el workspace a `getTrackerState`.                                                                              |
| Código m1   | `commitStart/End/Duration` casi idénticas                          | Un ayudante `commit(change, shown)`.                                                                                                                                          |
| Código m3   | « (termina un día después)» en dos componentes                     | `trackerLabels.endsNextDay`.                                                                                                                                                  |
| Código m4   | Clases del botón verde copiadas                                    | Variante `success` en `button.tsx`.                                                                                                                                           |
| Código m5   | Guarda de `noticeEpoch` duplicada; `switching` calculado dos veces | Hook `useStaleNotices(noticeEpoch, onStale)`; `switching` en un solo lugar.                                                                                                   |
| Código m7   | Comentarios que narran la historia del slice                       | Dejar solo el motivo vigente.                                                                                                                                                 |

Se mantiene: el campo `rejected` de `manual-draft.ts` (código m2), porque el
contrato lo pide.

## E2E — `e2e-tester`

| Origen    | Hallazgo                                                        | Resolución                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests B1  | El recorrido 5 falla antes de las 09:00 del workspace           | La entrada de hoy va de `00:00` a `00:01`, siempre pasada; corregir el comentario.                                                                                                                      |
| Tests M2  | Criterio 2: «queda en timer aunque el modo sea manual» sin test | En el recorrido 3: arrancar, cookie `clock.tracker-mode=manual`, recargar, afirmar «Detener» y conmutador inactivo **y** que el conmutador no muestra «manual» presionado; detener y afirmar «Agregar». |
| Seg. m-3  | `backdateWorkspace` escribe sin guarda                          | Abortar si el owner del workspace elegido no es `owner@${TEST_EMAIL_DOMAIN}`.                                                                                                                           |
| Código m9 | Repeticiones en `database.ts` y en el spec                      | Constante con la subconsulta del workspace; constante local con el texto de TT-30.                                                                                                                      |
| Paridad   | Cobertura de lo que corrige frontend                            | Recorridos nuevos: el primer clic en «Agregar» sin salir del campo crea la entrada (M-A); elegir otra fecha solo con teclado (M-B); el foco después de agregar (M-2).                                   |

El job e2e de CI pasa a un environment `preview` con `E2E_DATABASE_URL` y
`E2E_TEST_SESSION_SECRET` (`.github/workflows/ci.yml`, team-lead).

## Paridad — ya corregido

TT-108 y TT-99 en `docs/parity/time-tracker.md`: el aviso de fuera de ventana
aplica solo hacia atrás.

## Revisión de frontend de la ronda

Salida de `frontend-reviewer` sobre las correcciones de frontend: un
bloqueante, un mayor, cuatro menores. Resoluciones decididas:

| ID   | Hallazgo                                                                                                       | Resolución                                                                                                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1  | Un timer que llega con la descripción manual enfocada deja un texto ajeno en la barra y puede guardarlo encima | Los cambios de modo forzados (timer que llega o se va con el modo elegido en manual) resincronizan sin la guarda de edición: guardan o reponen el texto retenido y ponen `editing` en falso. `heldDescription` se limpia siempre al reponer. E2E del escenario. |
| M-1  | Devolver el foco a la descripción roba el foco de otro control                                                 | Solo se mueve si el foco está en `body`, es nulo o sigue dentro de la sección de la barra.                                                                                                                                                                      |
| m-1  | `onSuccess` pisa lo tecleado mientras viajaba el pedido; se puede conmutar con un agregado en vuelo            | Limpiar solo lo que sigue igual a lo enviado; conmutador inactivo con `add.pending`, y `ModeSwitch` muestra la ayuda de TT-30 solo cuando el motivo es un timer.                                                                                                |
| m-2  | El texto de TT-30 se lee hasta tres veces en lectura lineal                                                    | `aria-hidden="true"` en el `<p>` de ayuda del conmutador; `aria-describedby` lo sigue resolviendo. La repetición aviso/ayuda se mantiene, la pide el contrato.                                                                                                  |
| m-3  | `useStaleNotices` con un solo usuario; el aviso de detener se pierde si la barra vuelve a manual               | `start` y `stop` suben a `TrackerBar` como `add`; `startOperation` limpia los tres; desaparecen `noticeEpoch` y `useStaleNotices`.                                                                                                                              |
| m-4a | «Agregar» con `aria-disabled` responde a hover y active                                                        | Neutralizar con variantes `aria-disabled:`; sin `pointer-events-none`.                                                                                                                                                                                          |
| m-4b | `reset` usa el `serverNow` del render, con hasta 60 s de atraso                                                | Preexistente; se anota en el §8 del contrato y no se corrige en esta ronda.                                                                                                                                                                                     |
