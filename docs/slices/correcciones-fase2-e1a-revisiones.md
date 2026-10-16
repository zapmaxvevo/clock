# E1a: implementación y revisiones (2026-10-16)

Rama `fase2/e1a-invitar` desde `main` en `7763133`, en el worktree
`/home/maxi/program/clock-e1a` (fuera del repositorio). Contrato:
[`fase2-e1a-invitar.md`](fase2-e1a-invitar.md). ADR, aceptados el 2026-10-16:
[0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md) y
[0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md).

## Implementación

`backend-dev`, `frontend-dev` y `e2e-tester` en paralelo, cada uno con su base.
Backend fijó primero el esquema y las firmas (`5d473e3`). Los seis recorridos de
e2e fallaron por la razón esperada antes de la implementación.

Desviaciones declaradas y aceptadas por las revisiones:

- `DomainError`, `RejectedError`, `Rejection` y `ActionErrorCode` pasan a
  `src/server/errors.ts`: importarlos desde `action.ts` formaba un ciclo
  (workspace/service → action → session → profile → workspace/service) que
  dejaba la clase sin definir según el orden de carga. Después de la revisión
  de clean code, todo el repo los importa de ahí y `action.ts` no los reexporta.
- `planInvitations` es una función pura en `workspace/invitation-plan.ts`; los
  tests de `loginErrorUrl` y `sessionEntryError` van en integración.
- El `id` de cada rechazo de invitar es el correo normalizado.
- El script lee `GOOGLE_WORKSPACE_DOMAINS` para señalar correos del dominio, y
  vitest incluye `scripts/**`.
- Frontend: la primitiva `Badge` de shadcn, «Externa» también en el resultado, y
  el `<h1>` armado por `TeamScreen` y pasado a `TeamMembers`.

## Revisiones sobre `3dbfc51`

| Revisión   | Veredicto                       |
| ---------- | ------------------------------- |
| Backend    | Aprobado con cambios (1 M, 3 m) |
| Frontend   | Aprobado (2 m)                  |
| Clean code | Cambios requeridos (2 M, 3 m)   |
| Seguridad  | Aprobado (3 bajos)              |
| Tests      | Aprobado (1 m)                  |
| Paridad    | Aprobado, sin divergencias      |

Corregido:

- **Deadlock al invitar** (backend, mayor, reproducido): dos pedidos con
  `[x,y]` y `[y,x]` daban 40P01. `insertInvitations` ordena los correos
  (`a4f8593`); el test nuevo fallaba 3 de 3 sin el arreglo.
- Un pedido de solo blancos es `validation` con `noEmails`, y cada texto tiene
  tope de 1000 caracteres (`c84bfb4`); el diálogo también lo comprueba antes de
  mandar (`a769852`).
- El script avisa sin `GOOGLE_WORKSPACE_DOMAINS` y descarta lo que no es un
  correo (`d89c136`).
- Una sola ruta para los errores (`e278305`), `InvitationStatus` del enum
  (`1b2a23f`), `isCompanyEmail` y una sola normalización (`94d98c6`), `emailOf`
  compartido (`b162d00`).
- Frontend: el foco tras una revocación fallida, el aviso de copiado que se
  repite y `TeamInvitations` derivado (`8b1db00`).
- `CLAUDE.md`: `errors.ts`, `entry.ts`, `lib/email.ts`, `scripts/` y la regla
  del ADR 0025 (`ea41652`).

## Corrida final

Sobre `a769852` apareció una carrera de foco al revocar: si la revalidación
sacaba la fila antes de que cerrara el diálogo, el foco caía en «Invitar» y no
en el título (§5.4); 7 de 24 repeticiones. `2a9ea94` hace que `finalFocus`
devuelva el título cuando la fila ya no está: 48 de 48, contra 31 de 48 fallas
sin el arreglo.

Sobre `2a9ea94`: lint, typecheck, `prettier --check .`, 2153 de unidad, 305 de
`test:time-ar` y 1724 de integración (base nueva `clock_e1a_final`). E2E con
build limpio en :3100 y base nueva: los seis recorridos tres veces, la suite
223/223 dos veces y «revocar saca» 24 de 24 con 8 workers.

## Pendiente

- **Decisión del usuario (seguridad, bajo 1):** hasta E1b, revocar a un correo
  que sigue en `EXTERNAL_INVITE_EMAILS` no le corta la entrada. Propuesta del
  team-lead: después del `--apply` del script (§6.3, paso 2), vaciar la variable
  en Vercel; todos sus correos ya están en la base. La reversión de §2 ya pide
  volver a llenarla antes.
- **Producción (§6):** la consulta de §6.1, el despliegue, el script en seco y
  con `--apply`, invitar al grupo 3 (Nicolas Veliz incluido) y la verificación
  de humo de §6.4. La corre el usuario.
- Nota de la revisión de backend, sin cambio: si el primer ingreso de un correo
  del dominio coincide con una invitación al mismo correo, puede quedar una
  membresía activa con una invitación pendiente. La cierra la migración de E1b.
- Heredado de R8 (paridad): un admin al que le quitan el rol con `/equipo`
  abierto ve «No tenés permiso…» al recargar, no el texto de EQ-90.
