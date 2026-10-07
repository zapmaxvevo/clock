# Fase 1, arreglo: el piso de fechas es fijo, 2000-01-01

Cambio chico, fuera del orden de slices, pedido por el usuario el 2026-10-07 después del primer
deploy (opción A, aprobada por el usuario). Rama `fix/piso-fijo` desde `main` en `1959258`, con
el 2c ya mergeado.

## Qué pasó

En producción, el workspace se creó en el primer login, el miércoles 2026-10-07. En el
calendario, el lunes 5 y el martes 6 aparecen rayados y no se pueden cargar; el selector de
fecha tampoco deja elegir días anteriores. El piso de fechas es el día de creación del workspace
(`workspaceFloorDayKey`, `src/modules/time-entry/service.ts:127`), que fijó el ADR 0005 para
frenar payloads inventados con la premisa de que «no toca ningún caso de uso real». La premisa
es falsa: el primer día de uso real ya no se pueden cargar días anteriores. Los e2e lo
esquivaban atrasando `created_at` (`backdateWorkspace`, `e2e/database.ts`).

Arreglo provisorio en producción, lo corre el usuario en Neon:
`update workspace set created_at = '2026-01-01 03:00:00+00';`

## Decisiones

- **D1. El piso es una fecha fija, `2000-01-01`**, como clave de día en la zona de la persona,
  igual que hoy. Una constante en el service del módulo (`ENTRY_FLOOR_DAY_KEY`), que reemplaza a
  `workspaceFloorDayKey` en todos sus consumidores: las validaciones de alta y edición (`:896`,
  `:1066`, `:1131`), los pisos de la ventana (`:1721`, `:2026`), el piso de semana de «Cargar
  más» (`:1856`, que ya no corta nada en la práctica: `loadMoreFromOf` se apoya en la entrada más
  vieja que existe) y el `minDayKey` que va al cliente (`:1922`, `:2082`).
- **D2. El código de error pasa a `beforeFloor`**, con el texto «No se pueden cargar horas
  anteriores al 1 de enero de 2000.» El campo del calendario `beforeWorkspace` pasa a
  `beforeFloor`, y el rayado se conserva para los días anteriores al piso (en la práctica no se
  ve, salvo navegando a 1999). Se renombra porque el nombre viejo describe una regla que ya no
  existe.
- **D3. `TrackerWorkspace.createdAt` sale** si ningún consumidor lo usa después de D1.
  `workspace.created_at` en la base queda (lo usa el orden de `workspace/repository.ts:29`).
- **D4. `backdateWorkspace` sale de `e2e/`**, con sus llamadas, si ningún recorrido lo necesita
  después de D1 (el piso fijo es anterior a cualquier fecha que usen los e2e).
- **D5. ADR**: el usuario aprueba una nota fechada en el ADR 0005 («Qué puede falsear un
  cliente») y notas en el ADR 0008 (un `desde` anterior al piso se recorta) y en el ADR 0011 (la
  causa de fila «cae antes del piso»). Las redacta el team-lead.

## Reparto

- **backend-dev**: D1, D2 (código, texto, campo del calendario en el service y el esquema), D3,
  y los tests de integración y unidad que nombran `beforeWorkspace` o la creación del workspace
  (`service.integration.test.ts`, `actions.integration.test.ts`, `audit.integration.test.ts`,
  `manual-retry.integration.test.ts`, `schema.test.ts`, y los que haya). Tests nuevos: con un
  workspace creado hoy, una entrada del lunes anterior se acepta por alta manual, edición de
  horas, edición en masa, continuar o duplicar y los gestos del calendario (el service que los
  atiende); `1999-12-31` se rechaza con el texto nuevo y `2000-01-01` se acepta. Cada test nuevo
  falla con el piso viejo (mutante: volver a `dayKey(workspace.createdAt, …)`).
- **frontend-dev**: el campo `beforeFloor` en `calendar-day-column.tsx`, `calendar-layout.ts` y
  sus tests (`calendar-gestures.test.ts` y los que haya); nada más debería cambiar, porque el
  cliente ya recibe `minDayKey`. Arranca cuando backend avise el cambio de tipos.
- **e2e-tester**: D4, y un recorrido con el workspace **sin atrasar**: cargar el lunes de la
  semana pasada desde la barra manual y desde el calendario (crear), y moverlo con un gesto.
  Falla con el piso viejo.
- **parity-analyst**: `docs/parity/calendario.md` (CAL-48, CAL-85, la lista de mensajes
  ~`:1103`), `docs/parity/timesheet.md` (TS-12, TS-81, TS-90) y lo que nombre la creación del
  workspace como piso en `time-tracker.md`, con notas `_Corregido_`.

## Criterio de terminado

- Con un workspace creado hoy, se puede cargar el lunes anterior desde la barra manual, el
  calendario (crear y arrastrar), la edición de horas y la edición en masa.
- Una fecha anterior a 2000-01-01 se rechaza en el servidor con el texto nuevo.
- `npm run lint && npm run typecheck && npm run test:all` y la suite e2e en verde.
- Después del deploy, el `update` provisorio de producción queda sin efecto práctico.
