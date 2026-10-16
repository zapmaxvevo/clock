# 0025. Un módulo escribe en las tablas de otro por su service

Fecha: 2026-10-16. Estado: **Propuesto (lo aprueba el usuario)**.
Origen: el [mapa de la fase 2](../slices/fase2-mapa.md) (revisión,
hallazgo 10), que lo asigna al contrato de E1a
([`fase2-e1a-invitar.md`](../slices/fase2-e1a-invitar.md)) porque E1a es el
primer slice de la fase que escribe datos ajenos. Extiende el
[ADR 0010](0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md).

## Contexto

El ADR 0010 dejó dicho cómo un módulo **consulta** las reglas de otro: por una
función del service del dueño que recibe la transacción de quien llama y solo
lee con ella. Para escribir dejó la puerta cerrada: «Una función exportada a otro
módulo que necesitara escribir, o garantizar que lo leído no cambie, no entra en
esta regla: se discute en el contrato que la pida».

La fase 2 trae varias escrituras que cruzan módulos, y todas tienen que caer en
la misma transacción que la operación que las pide:

- **Desactivar** (E2, EQ-41, EQ-43): `team` detiene el timer de la persona, que
  es una fila de `time_entry`, del módulo `time-entry`, y borra sus filas de
  `session`, que son de Better Auth.
- **Transferir la propiedad** (E3, EQ-57): `team` escribe `workspace.owner_id`,
  del módulo `workspace`.
- **Aceptar una invitación** (E1a, E1b): la membresía nace en `workspace` y la
  invitación tiene que quedar aceptada en la misma transacción. El
  [ADR 0024](0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md)
  pone la invitación en `workspace`, así que esta no cruza.
- **Volver a entrar sin `account`** (E2b): probablemente escriba en tablas de
  Better Auth.

Hay un precedente que no pasó por ningún ADR: en R8, `team` escribe la columna
`role` de `membership` con su propio repository, mientras `workspace` crea la
fila (D-R8-1, «escrituras de columnas distintas con dueño distinto»).

## Opciones

1. **El repository de quien llama escribe la tabla ajena**, como R8 con
   `membership`. Es lo más corto, pero las reglas del dato se copian: detener un
   timer es poner el fin con el instante de la base y dejar el audit log como lo
   deja `time-entry`. La próxima regla de `time-entry` sobre un timer detenido
   tendría que acordarse de `team`.
2. **El service del dueño exporta una función que escribe**: recibe la
   transacción y el actor de quien llama, aplica las reglas del dato, escribe
   con esa transacción y deja su audit log. El cambio cae entero o no cae.
3. **Dos transacciones, una por módulo**, encadenadas por la action. No hay
   atomicidad: una desactivación podría quedar con la membresía inactiva y el
   timer corriendo, que es lo que EQ-41 pide que no pase.

## Decisión

La opción 2, con estas reglas:

- **Cada tabla tiene un módulo dueño**, que es el único que la escribe con su
  repository:
  - `time_entry` y sus uniones: `time-entry`;
  - `workspace`, `workspace_settings` e `invitation`: `workspace`;
  - `client`, `project`, `task`, `tag` y las de miembros y asignados: `project`;
  - `user_preference`: `profile`;
  - `user`, `account`, `session` y `verification`, de Better Auth: el código de
    `src/server/` que configura el login, con una función propia al lado de
    `auth.ts`;
  - `membership` es la excepción que ya existe, **repartida por columna**: la
    fila y su lectura para la sesión son de `workspace`; `role`, `status`,
    `week_start` y lo que la fase 2 sume para administrar personas, de `team`
    (D-R8-1). Una columna nueva de `membership` dice en el esquema de quién es.
- **Escribir en una tabla ajena es llamar a una función exportada del service
  del dueño** que:
  - recibe la transacción de quien llama (`tx: Transaction`) como primer
    argumento, escribe solo con ella y no abre otra;
  - aplica las reglas del dato y deja la fila de `audit_log` con el actor que
    recibe;
  - **no decide el permiso de la operación de quien llama**: ese lo decidió
    quien llama, con `can()` sobre su recurso, antes de llamarla. La función no
    es una action ni la llama ninguna action; su comentario dice qué operaciones
    la usan;
  - lanza solo códigos de `ActionErrorCode`, como en el ADR 0010.
- **Los bloqueos los decide quien llama**, en su contrato, con el orden de todas
  las filas de la operación. La función del dueño no toma bloqueos por su
  cuenta salvo los de su propia escritura, y el contrato que la escribe los
  nombra.
- **Las dependencias siguen en una dirección.** Si el dueño necesitara importar
  a quien llama, la operación está en el módulo equivocado. Es lo que pasó con
  la invitación (ADR 0024): por eso es de `workspace`.

## Consecuencias

- **E1a no escribe datos ajenos**: la invitación es de `workspace` y se acepta
  ahí. La regla queda escrita para E2, E2b y E3.
- **E2** suma a `time-entry` una función que detiene el timer de otra persona con
  el actor de quien desactiva, y a `src/server/` una que borra las sesiones de
  una persona. **E3** suma a `workspace` la que cambia `owner_id`.
- **Cada función se prueba en dos lugares**: en los tests de integración del
  dueño, sus reglas y su audit log; en los de quien llama, que un rechazo
  posterior en la misma transacción deshace también lo que escribió.
- **R8 no cambia**: su escritura de `role` es de `team` por la regla de
  `membership`.
- **`CLAUDE.md` suma una línea** en «Recorrido de una mutación»: un service
  escribe en las tablas de otro módulo solo por una función exportada del
  service dueño, que recibe la transacción.
