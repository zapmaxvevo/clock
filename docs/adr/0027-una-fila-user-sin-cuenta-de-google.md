# 0027. Una fila `user` sin cuenta de Google

Fecha: 2026-10-19. Estado: Propuesto.
Origen: el contrato de E2b
([`fase2-e2b-sin-cuenta.md`](../slices/fase2-e2b-sin-cuenta.md)), con el
[mapa de la fase 2](../slices/fase2-mapa.md) (§2 grupo 2, E2b, §4, §5 y §7),
[`equipo.md`](../parity/equipo.md) (EQ-109, EQ-110, EQ-114, P-05) y
[`perfil.md`](../parity/perfil.md) (PF-47, PF-48, P-11).

## Contexto

Better Auth decide a qué fila `user` entra un ingreso con Google en
`handleOAuthUserInfo`
(`node_modules/better-auth/dist/oauth2/link-account.mjs`, 1.7.7):

- primero busca la cuenta por su clave, `provider_id` y `account_id`, que para
  Google es el claim `sub` (`@better-auth/core/dist/social-providers/google.mjs:56`;
  `link-account.mjs:80-106`). Si la encuentra, entra a la fila dueña de esa
  cuenta;
- si no, busca la fila por correo (`link-account.mjs:119-125`). Si hay una y no
  tiene esa cuenta, la enlazaría por correo, salvo que el enlace implícito esté
  apagado (`:134-145`), y responde `account not linked`;
- si no hay fila, crea `user` y `account` en una transacción (`:274-289`).

`src/server/auth.ts` apaga el enlace implícito (`disableImplicitLinking`) desde el
slice 7b (PF-47): sin eso, una dirección reciclada entraba a la fila de la persona
anterior, con su rol y sus horas. Y cierra los caminos de la API que enlazan una
cuenta a mano (`/link-social`, `/unlink-account`). El costo es que **una fila
`user` sin la cuenta de Google de su dueña no tiene forma de entrar**:

- **Las importadas**: el script de importación de Clockify creó `user` y una
  membresía `inactive` para las personas desactivadas en Clockify, sin `account`.
  En producción son tres (consulta del 2026-10-19).
- **Las desactivadas con el procedimiento SQL** del núcleo antes de E2, que
  borraba `account` (EQ-110).
- **Una persona con cuenta que necesita otra** (EQ-109, PF-47): la empresa
  recreó su cuenta de Google, o la persona entra con otra. El `sub` nuevo no
  tiene cuenta y la fila ya tiene una.
- **Una dirección reciclada** (EQ-109): la dirección de una persona que se fue
  pasa a otra persona. La fila vieja ocupa el correo, y la persona nueva no entra
  ni con una invitación: invitar ese correo responde EQ-79, porque es el de una
  inactiva.

E2 impide reactivar a quien no tiene `account` hasta este ADR (D-E2-7, EQ-114).
El ingreso decide quién entra en `mapProfileToUser` y en el gancho
`session.create.before`
([ADR 0024](0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md),
decisión 4), y desde E2 solo con una membresía activa (P-05).

Lo que fija la librería:

- **`mapProfileToUser` corre antes de la búsqueda**: el callback llama a
  `getUserInfo` (`better-auth/dist/api/routes/callback.mjs:120-128`), que llama a
  `mapProfileToUser` con el `id_token` decodificado, `sub` incluido
  (`google.mjs:116-135`); después deriva la clave (`callback.mjs:137`) y recién
  entonces llama a `handleOAuthUserInfo` (`:172-194`). Es el único punto propio
  que conoce el `sub` antes de que Better Auth busque la cuenta. Corre fuera de
  todo `try` del callback (`src/server/auth.ts:74-76`): un error que no sea una
  redirección sale como un 500.
- **No hay un enlace por pedido**: `disableImplicitLinking` es una opción
  estática y se evalúa sin excepción en el camino del callback
  (`link-account.mjs:139`); `trustedProviders` no la saltea. El enlace a una
  fila elegida (`selectedUser`, `:78`, `:107-118`) solo lo usan plugins, y el
  callback no lo pasa (`callback.mjs:172-190`). El enlace explícito
  (`linkOAuthAccount`, `:22-71`) necesita una sesión de la persona, que es
  justo lo que no tiene.
- **Una clave en dos filas rompe el ingreso**: `findAccountOwnerByKey` lanza si
  dos filas de `account` tienen el mismo `sub`
  (`better-auth/dist/db/internal-adapter.mjs:555`). `account` no tiene índice
  único por esa clave (`src/server/db/auth-schema.ts:36-58`), y la tabla la
  regenera `npm run auth:schema`.

## Opciones

1. **Enlace implícito para las filas sin cuenta con membresía activa**: en
   `mapProfileToUser`, si la fila del correo no tiene ninguna cuenta y su
   membresía está activa, se escribe la cuenta. Reactivar sería la
   autorización. No necesita estado nuevo, pero no cubre a quien ya tiene una
   cuenta (EQ-109), no deja ver ni cancelar la autorización, y toda fila activa
   sin cuenta que exista al desplegar quedaría abierta sin que nadie lo decida.
2. **El `sub` conocido**: alguien carga el `sub` de Google de la persona y se
   escribe la cuenta. Es la atadura más fuerte, pero nadie lo conoce: Clockify
   no lo exporta, el procedimiento SQL lo borró, y la persona no lo ve en ningún
   lado.
3. **Una invitación que ata la fila**: una invitación `pending` para el correo
   de una persona existente que, al usarse, enlaza la cuenta. Reusa la pantalla
   de invitar, pero rompe dos invariantes de E1a y E2: una pendiente es de un
   correo sin membresía, y la membresía gana sobre la invitación (D-E2-1). La
   confianza es la misma que la de la opción 4: quien tenga la dirección.
4. **Una vinculación que pide el owner y usa el próximo ingreso**: una marca en
   la membresía activa, visible en la fila, cancelable y con vencimiento, que el
   próximo ingreso con ese correo usa una sola vez para dejar su `sub` como la
   cuenta de la fila. La escribe `mapProfileToUser` después de decidir la regla
   de ingreso y antes de la búsqueda de Better Auth, que después encuentra la
   cuenta y entra por el camino normal.
5. **La opción 4 con un código de un solo uso**: el owner le pasa a la persona
   un código que acompaña el ingreso. Ata la fila a quien recibió el código y no
   solo a quien tiene la dirección, pero pide una pantalla previa al ingreso y
   llevar el código por el `state` de OAuth hasta `mapProfileToUser`, que no
   recibe el pedido.
6. **Rehacer la fila**: dejar que Better Auth cree un `user` nuevo y mover la
   membresía, las horas, los proyectos y el audit log a él. Toca todas las
   tablas con `user_id` y la clave `restrict` de `time_entry`.

Para la dirección reciclada, la salida no es entrar a la fila vieja sino
desocupar el correo:

- **a. Liberar el correo de la fila inactiva**: la fila vieja deja el correo, su
  cuenta y sus sesiones, y conserva nombre, membresía y horas. La dirección se
  invita como cualquier otra.
- **b. Borrar la fila vieja**: imposible con horas (EQ-50), y E6 deja `user` y
  `account` aunque quite la membresía (EQ-108).
- **c. Corrección a mano en la base**, que es la salida de hoy (perfil P-11).

## Decisión

**La opción 4 para entrar a una fila, y la a para desocupar un correo**, con
estas reglas:

1. **La vinculación es una marca de la membresía**: dos columnas de
   `membership`, quién la pidió y cuándo, de `team` por el
   [ADR 0025](0025-un-modulo-escribe-en-otro-por-su-service.md) («lo que la
   fase 2 sume para administrar personas»). Un `check` la ata a una membresía
   `active`: solo una membresía activa recupera la entrada (P-05).
2. **La pide solo el owner**, con una acción propia de `can()`,
   `team.account.link`, como las excepciones del
   [ADR 0023](0023-quitar-el-rol-de-admin-es-una-accion-propia.md). Reactivar a
   una persona sin cuenta es reactivar y pedir la vinculación en una
   transacción, y por eso también es solo del owner. El owner puede pedirla
   para su propia fila.
3. **La usa el próximo ingreso que pasa la regla de ingreso**, con el correo de
   esa fila y mientras la marca esté vigente, si su `sub` no es la cuenta de
   ninguna fila. **La regla se decide primero**: un perfil sin `hd` en un correo
   del dominio, o sin correo verificado, no toca la marca. En una transacción
   que bloquea la membresía: limpia la marca, borra las otras cuentas, las
   sesiones y las autorizaciones de MCP de la fila, si las hay, e inserta la
   cuenta nueva. Better Auth la encuentra y entra a esa fila
   (`link-account.mjs:96-106`, `:190-237`). Una sola vez: un segundo ingreso con
   otro `sub` encuentra la marca limpia y es rechazado. Si la transacción falla,
   no escribe nada y el ingreso termina en `/login` con el texto genérico; si la
   membresía resulta inactiva bajo el bloqueo, con el motivo de una inactiva.
4. **Vence**: la marca vale un plazo desde que se pide (el contrato propone
   siete días y lo deja como pregunta al usuario), calculado al leerla, sin
   cron. Vencida, no se usa; el owner la vuelve a pedir.
5. **Desactivar la cancela**, en la misma transacción.
6. **Liberar el correo es otra acción solo del owner**, `team.email.release`,
   sobre una membresía inactiva. El correo pasa a una dirección que no se
   resuelve (`<id>@liberado.invalid`), y la fila pierde sus cuentas, sus
   sesiones y sus autorizaciones de MCP. No se deshace desde la aplicación; el
   audit log guarda el correo anterior.
7. **El rechazo de Better Auth tiene texto propio**: `/login` explica
   `account_not_linked` con un texto neutro, que no sugiere vincular ni
   liberar: el owner decide cuál de las dos corresponde (perfil P-11).
8. **Pedir la vinculación de un externo sin invitación abierta lo registra**,
   con una invitación `accepted`. Cambia lo que significa una `accepted` en la
   decisión 3 del ADR 0024: además de «entró por una invitación», puede ser «el
   owner la registró al pedir una vinculación». El registro se hace al pedir y
   no se deshace al cancelar ni al vencer la vinculación: un externo activo con
   cuenta y sin invitación abierta vuelve a entrar con esa cuenta apenas se
   pide, y conserva la entrada aunque la vinculación se cancele.
9. **El enlace implícito sigue apagado** y la aplicación sigue sin exponer
   `/link-social` ni `/unlink-account`. Ningún camino escribe una cuenta sin una
   marca vigente que pidió el owner.

Se descartan la 1 porque abre filas que nadie eligió y no cubre EQ-109; la 2
porque el dato no existe; la 3 porque mezcla dos estados con reglas opuestas sin
sumar seguridad; la 5 por costo, frente a un riesgo que el owner ya controla al
pedir la vinculación (queda como pregunta del contrato); y la 6 por el alcance
de la escritura.

## Consecuencias

- **El riesgo de PF-47 vuelve, acotado**: mientras una vinculación está
  vigente, quien tenga esa dirección y pase la regla de ingreso entra a la
  fila. Lo acotan que la pida el owner, que se vea en la fila, que se cancele,
  que venza, que valga una vez y solo con la membresía activa. Para el dominio
  de la empresa, la dirección la controla la empresa con el claim `hd`.
- **`mapProfileToUser` escribe**: hasta acá solo leía. Si el ingreso falla
  después del `commit` de la vinculación, la cuenta queda vinculada, que es lo
  que el owner pidió; el reintento entra por el camino normal.
- **Una actualización de Better Auth puede mover el punto**: si `getUserInfo`
  dejara de correr antes de `handleOAuthUserInfo`, o si un camino nuevo llamara
  a `getUserInfo` sin la regla de ingreso, la vinculación llegaría tarde o por
  otro lado. Cada actualización vuelve a verificar la lista del contrato (§0), y
  un test de integración recorre el callback entero.
- **Una fila liberada tiene un correo que no es un correo**: todo lector de
  `user.email` que muestre el dato lo trata como liberado (`isReleasedEmail` de
  `src/lib/email.ts`). Hoy lo muestra solo la pantalla de equipo; el perfil y el
  encabezado son de la persona, que ya no entra.
- **Una `accepted` ya no dice cómo nació**: el audit log la distingue
  (`invitation.accept` o `invitation.register`).
- **El script de importación identifica por correo**: una corrida después de
  liberar un correo no encuentra a la persona vieja. El contrato pide una
  consulta antes de cada corrida.
- **No resuelve PF-48** (la empresa cambia la dirección de una persona activa):
  sigue siendo una corrección a mano.
- **Si el owner pierde su cuenta de Google sin una vinculación pedida**, nadie
  puede pedirla desde la aplicación; la salida es una sentencia SQL que escribe
  la marca, en el contrato.
- **E2 cambia**: D-E2-7 se levanta y EQ-114 pasa a ser el rechazo de un admin
  que pide reactivar a una persona sin cuenta.
