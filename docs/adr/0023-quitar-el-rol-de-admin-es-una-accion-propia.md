# 0023. Quitar el rol de admin es una acción propia, solo del owner

Fecha: 2026-10-13. Estado: Propuesto (lo aprueba el usuario).
Origen: la corrección del 2026-10-13 al contrato de R8
([`nucleo-reportes-r8-cambiar-rol.md`](../slices/nucleo-reportes-r8-cambiar-rol.md),
D-R8-5 y D-R8-13), revisada por `architecture-reviewer` en `1379b29`.

## Contexto

R8 trae `/equipo`, donde el owner y los admins pasan una membresía activa de
`member` a `admin`. El contrato dejaba a un admin bajar a otro admin y a sí
mismo, y en Clockify estaba _no verificado_. `parity-analyst` lo relevó el
2026-10-13, con FOUND literal confirmado dos veces:

- «Only the Workspace owner can remove an admin role from someone, transfer
  ownership to another user, and delete the workspace.» (página de invitar
  personas);
- «Manage users | Yes (except removing Admin role – Owner only)», con «Assign
  user roles | Yes» para el admin
  (https://clockify.me/help/administration/user-roles-and-permissions/admins).

El usuario decidió ese día replicarlo: **un admin asciende, pero solo el owner
quita el rol de admin**, también cuando el admin es uno mismo.

Es una regla de acceso, y toda decisión de acceso vive en
`can(actor, action, resource)` (`src/server/permissions/index.ts`). Hasta R8,
`team.manage` (owner y admin) decidía sobre un `MembershipResource` con su
`workspaceId`, `userId` y `role`, y la única regla por fila era que la membresía
del owner solo la toca el owner.

## Opciones

1. **Una regla dentro de `team.manage`**: sobre un `MembershipResource` con rol
   `admin`, solo el owner.
2. **Una acción nueva, `team.admin.revoke`**, sobre `MembershipResource`, con
   `["owner"]` en la tabla de roles. Bajar a un admin pide `team.manage` y
   `team.admin.revoke`.
3. **La regla en el service del módulo `team`**, sin tocar `can()`.

## Decisión

La opción 2.

- **`team.admin.revoke`** entra en `ResourceByAction` con `MembershipResource`,
  en `resourceKinds` con `["membership"]` y en `allowedRoles` con `["owner"]`.
  El cuerpo de `can()` no cambia: alcanzan el corte por estado, el de
  workspace, el de la clase de recurso y la tabla de roles, como en
  `workspace.transfer` y `workspace.delete`, que también son solo del owner.
- **Se consulta solo sobre una fila `admin`.** `can()` no mira el rol de la
  membresía para esta acción: sobre una `member`, el owner también recibe
  `true`. El service la consulta cuando la membresía leída es `admin` y se pide
  `member`; la vista, para dibujar «Quitar administrador» en una fila `admin`.
  Elegir qué acción consultar según el pedido no es decidir acceso fuera de
  `can()`: decide `can()`.
- **Pedir el rol que la membresía ya tiene** no quita nada y no consulta
  `team.admin.revoke`: el reintento de un ascenso sigue siendo éxito sin
  escribir.

## Por qué

- **La opción 3** deja una decisión de acceso fuera de `can()`, que es lo que
  el módulo de permisos prohíbe.
- **La opción 1 decide por el rol que la membresía tiene, no por el cambio
  pedido.** Un admin se quedaría sin `team.manage` sobre cualquier membresía
  `admin`:
  - el reintento de un ascenso cuya respuesta se perdió encuentra a la persona
    ya `admin` y respondería `forbidden` en vez de éxito sin escribir, y de dos
    admins que ascienden a la misma persona a la vez, el segundo también;
  - en la fase 2, le cerraría a un admin todo lo demás sobre otro admin
    —desactivarlo, su primer día de la semana, su capacidad—, cuando Clockify
    solo exceptúa quitar el rol.
- **La opción 2 nombra la excepción exacta** y la vista y la mutación la
  heredan de `can()`, sin comparar roles para decidir acceso.

## Consecuencias

- **Un admin no baja a nadie, tampoco a sí mismo**, y el owner no se baja
  porque su rol no se cambia desde `/equipo`: no hay confirmación de bajarse a
  sí mismo. Si un admin asciende a alguien por error, lo baja el owner.
- **La vista llama a `can()` por fila** para armar el control de cada membresía.
- **Quien reuse la acción en la fase 2** tiene que consultarla solo sobre una
  membresía `admin`, por lo de arriba. Si la pantalla de equipo ofrece quitar el
  rol desde otro lugar, usa esta acción.
- **`team.manage` sobre una membresía `admin` sigue siendo de owner y admin.**
  Qué más de un admin puede tocar otro admin (desactivarlo, su capacidad) lo
  decide el contrato de la fase 2; si Clockify exceptúa algo más, entra como
  otra acción propia, no como una regla por rol dentro de `team.manage`.
- **Sin piso de admins**: con la membresía del owner inactiva por SQL, nadie
  puede quitar el rol de admin y la salida es SQL.
