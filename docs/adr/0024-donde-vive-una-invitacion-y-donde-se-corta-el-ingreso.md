# 0024. Dónde vive una invitación y dónde se corta el ingreso

Fecha: 2026-10-16. Estado: **Propuesto (lo aprueba el usuario)**.
Origen: el contrato de E1a
([`fase2-e1a-invitar.md`](../slices/fase2-e1a-invitar.md)), con el
[mapa de la fase 2](../slices/fase2-mapa.md) (§2, E1a y E1b) y
[`equipo.md`](../parity/equipo.md) (EQ-17, EQ-18, EQ-22 … EQ-24, EQ-29,
EQ-32, EQ-51).

## Contexto

Hoy entra a Clock quien pasa el login de Google
(`src/server/auth.ts`):

- **`mapProfileToUser`** llama a `decideGoogleAccess` (`src/server/access.ts`)
  con el perfil de Google: entra un correo de `GOOGLE_WORKSPACE_DOMAINS` cuyo
  claim `hd` lo confirme, o un correo de la variable `EXTERNAL_INVITE_EMAILS`.
  Corre antes de que Better Auth cree o actualice `user` y `account`, y puede
  ser asíncrona (`OAuthProfileMapper` devuelve `Awaitable`).
- **El gancho `session.create`** vuelve a comprobar el correo guardado en cada
  inicio de sesión, sin el claim, con `isAllowedEmail`.
- **`ensureWorkspaceContext`** (`src/modules/workspace/service.ts`) crea una
  membresía `member` a cualquiera que tenga sesión. Es la deuda del slice 1.

El usuario decidió el 2026-10-16 que **todos entran por invitación**, también el
dominio de la empresa (P-02), y que owner y admin invitan **correos de otro
dominio** desde la pantalla (P-03). El mapa de la fase 2 lo hace en dos pasos:
E1a trae las invitaciones sin cerrar la puerta y migra la variable a la base;
E1b cierra la puerta.

Lo que ya está fijado por otros lados:

- **Una invitación pendiente no puede ser una fila de `membership`**:
  `membership.user_id` apunta a `user`, que Better Auth crea en el primer
  ingreso, y crear filas de `user` por adelantado le cierra la entrada a la
  cuenta de Google verdadera, porque el enlace implícito está apagado (EQ-17,
  PF-47).
- **`external_invite`** existe desde la migración inicial, con workspace,
  correo, quién invitó y `revoked_at`, y un índice único **no parcial** sobre
  `(workspace_id, email)`. Ningún código la escribe ni la lee.
- **Las dependencias entre módulos van en una dirección** (ADR 0010): `team`
  importa de `profile`, y `profile` de `workspace` (D-R8-1). `workspace` no
  puede importar de `team`.
- **Las altas llevan un id que elige el cliente** (ADR 0007), para que
  «Reintentar» no duplique.

Hay que decidir dónde vive la invitación, qué forma tiene, cuál es la regla de
ingreso, en qué punto del login se corta, qué habilita una invitación aceptada,
cómo se reintenta y cómo se pasa de la variable a la base.

## Opciones

### Dónde vive

1. **Una fila de `membership` con estado `invited`.** Imposible sin una fila de
   `user` (EQ-17).
2. **Una tabla por correo, del módulo `team`**, que es el de la pantalla
   (D-R8-1 lo anticipaba: «invitar… entra acá»). La invitación se acepta donde
   nace la membresía, en `ensureWorkspaceContext`, que es de `workspace`:
   `workspace` tendría que llamar a `team`, y `team` ya depende de `workspace`
   por `profile`. Es un ciclo.
3. **Una tabla por correo, del módulo `workspace`**, que ya crea las membresías
   y decide quién entra. La pantalla de `team` la muestra y la manda a escribir
   por el service y las actions de `workspace`.
4. **Un módulo nuevo, `invitation`.** Clasificar un correo (EQ-20, EQ-21) pide
   saber si ya tiene membresía, que es de `workspace`; y `workspace` lo
   necesitaría para aceptar. Otro ciclo.

### Una fila o varias por correo

1. **Una fila por `(workspace, correo)`**, con su estado, que vuelve a
   `pending` cuando se invita de nuevo. Se queda el índice único completo que ya
   existe.
2. **Una fila por invitación**, con un índice único parcial sobre las vigentes.
   La tabla guarda la historia, y cada lectura tiene que elegir la fila que
   vale.

### Dónde se corta

1. **En `ensureWorkspaceContext`.** Better Auth ya creó `user`, `account` y la
   sesión: quien no tiene invitación queda con una sesión con la que pedir
   páginas. EQ-29 lo prohíbe.
2. **En el gancho `session.create`.** No queda sesión, pero sí `user` y
   `account`, que Better Auth crea antes de la sesión. El script de importación
   convierte en membresía a cualquier `user` sin membresía que esté en su lista
   (`newMembership`), y un `user` sin membresía es un estado que hoy no existe.
3. **En `mapProfileToUser`**, antes de crear nada, con el gancho de sesión como
   segunda comprobación sobre el correo guardado.

## Decisión

1. **La invitación es del módulo `workspace`** (opción 3). Su tabla,
   `invitation`, reemplaza a `external_invite`, que está vacía. El esquema, el
   repository, el service y las actions de las invitaciones son de
   `workspace`; la pantalla `/equipo` sigue siendo de `team`, que las muestra
   con una lectura del service de `workspace` (ADR 0010) y recibe sus actions
   por props. Las piezas de interfaz viven en `team/components`, que importa
   tipos de `workspace/schema.ts`: la dirección es la de siempre.

2. **Una fila por `(workspace, correo)`**, con estado `pending`, `accepted` o
   `revoked` y el correo recortado y en minúsculas, que la base exige con un
   `check`. Volver a invitar un correo revocado, o el de una persona a la que se
   quitó del equipo (EQ-51, que llega con E6), devuelve **la misma fila** a
   `pending`. Se queda el índice único completo, renombrado
   `invitation_workspace_email_unq`. La historia está en `audit_log`.

3. **La regla de ingreso tiene dos partes, y cada una se decide por vía.**
   - **Identidad**: la **vía del dominio** —un correo de
     `GOOGLE_WORKSPACE_DOMAINS` y el claim `hd` que lo confirma— o la **vía
     externa** —un correo **fuera** de esos dominios con una invitación
     `pending` o `accepted`—. La vía externa no vale para un correo del dominio:
     una cuenta de Google de consumo con ese correo y sin `hd` no entra por
     tener invitación.
   - **Acceso**, desde E1b: una membresía —activa, desde E2— o una invitación
     `pending`.
   - **En E1a** la identidad suma la vía externa por la base, que convive con
     la variable, y el acceso no cambia: entra quien pasa la identidad.

4. **Se corta en `mapProfileToUser`** (opción 3), antes de que Better Auth cree
   `user` y `account`. El gancho `session.create` vuelve a decidir con el
   correo guardado, sin el claim, como hoy; y `ensureWorkspaceContext` crea la
   membresía —desde E1b, solo desde una invitación pendiente—. La decisión
   sigue siendo una función pura de `access.ts`; los hechos de la base (si hay
   una invitación abierta para el correo, y desde E1b la membresía) los lee una
   función del service de `workspace`, y `auth.ts` los junta.

5. **Toda membresía que nace acepta la invitación pendiente de su correo**, en
   la misma transacción, desde E1a. Una invitación aceptada **sostiene la
   identidad externa** de quien ya entró y **no da acceso**: el acceso es la
   membresía o una invitación pendiente. A una persona quitada del equipo (E6)
   la vuelve a dejar entrar solo una invitación nueva (EQ-51). E1b trae una
   migración que acepta las pendientes cuyo correo ya tiene membresía: las que
   quedaron de una corrida del script de importación, que crea membresías por
   su cuenta.

6. **Invitar no lleva id del cliente: es una excepción al ADR 0007.** El ADR
   0007 resuelve el reintento de un alta que crea una fila nueva cada vez. Una
   invitación tiene clave natural, el correo dentro del workspace, y el
   reintento se resuelve por ella: el correo que ya tiene invitación pendiente
   responde «ya estaba invitada» sin escribir (EQ-19), y dos pedidos
   simultáneos con el mismo correo dejan una sola fila (EQ-106). Revocar una
   invitación ya revocada responde éxito sin escribir, por el mismo motivo.

7. **El estado `invited` de `membership_status` queda sin escritor.** No se
   quita: sacar un valor de un enum de Postgres pide recrear el tipo y reescribir
   `membership`, y nada nuevo lo produce. Queda como deuda del mapa (§6).

8. **La variable pasa a la base una sola vez.** E1a lee la base y la variable,
   y un script que corre el usuario copia cada correo de la variable a
   `invitation`: `accepted` si ya tiene membresía, `pending` si no. Es la
   precondición de E1b, que deja de leer la variable.

9. **«Externa» no se guarda**: se deriva del dominio del correo al mostrarla,
   con la misma lista de dominios que usa el ingreso.

## Consecuencias

- **Un ingreso rechazado no deja filas.** Desde E1b, quien no tiene invitación
  no llega a tener `user` ni `account`, y el `newMembership` del script de
  importación no tiene de dónde salir. En E1a nada cambia para el dominio.
- **El login lee la base**: una consulta por índice en cada ingreso con Google
  y en cada inicio de sesión, no en cada pedido.
- **La regla de ingreso vive en un lugar**: la decisión en `access.ts`, los
  hechos en `workspace`. `auth.ts` no decide nada.
- **D-R8-1 cambia en un punto**: «invitar entra acá» se cumple para la
  pantalla; los datos y las reglas son de `workspace`. El resto del reparto
  sigue: `workspace` crea las membresías, `team` las administra.
- **Volver a invitar pisa** quién invitó y cuándo; lo anterior queda en
  `audit_log`.
- **La migración borra `external_invite`** y corta si tiene alguna fila: el
  código nunca la escribió, y una fila escrita a mano no se pierde en silencio.
- **Revocar es solo para pendientes** (EQ-23). Cortarle el acceso a un externo
  que ya entró es desactivarlo (EQ-32), que llega con E2.
- **`membership.created_at` es la fecha de activación** (EQ-33): la membresía
  nace al aceptar.
- **La sesión de prueba de los e2e** crea personas sin invitación; con E1b, el
  arnés tiene que sembrar la membresía o la invitación.
