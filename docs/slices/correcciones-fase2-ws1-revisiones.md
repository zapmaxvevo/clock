# Correcciones de WS1: revisiones

Registro de los desvíos del contrato
[`fase2-ws1-configuracion.md`](fase2-ws1-configuracion.md) y de lo que decidan
las revisiones. El team-lead decide cada fila.

## Desvíos de la implementación

| Origen      | Desvío                                                                                                                                                                                                                                                                                                                  | Decisión y dueño        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| backend-dev | §9.2 pide los criterios 1 a 4 sobre el service; **el 3 (validaciones) no va sobre el service**, que recibe la entrada ya parseada. Va en `schema.test.ts` (cada caso, el recorte y el mensaje) y en `actions.integration.test.ts` (cada caso con `validation`, su texto y que no escribe).                              | Pendiente.              |
| backend-dev | El paso 1 de §4.3 (`can()` antes de abrir la transacción) no tenía un test que lo detectara. **Corregido por T-2**: «un member recibe ForbiddenError sin esperar a una membresía tomada» falla sin el paso 1 (`blocked` en lugar de `ForbiddenError`).                                                                  | Corregido en `d8cc35d`. |
| backend-dev | El caso «workspace ajeno» del service (`settings.integration.test.ts`) prueba la relectura: un actor con el `workspaceId` de otro workspace, sin membresía ahí, recibe `ForbiddenError` y no escribe en ninguno. La comparación de workspace de `can()` para `workspace.settings.update` la fija `permissions.test.ts`. | Pendiente.              |
| backend-dev | El MCP no está en `main` (`eb2ba2d`): la constancia se arma con `workspaceId` y `actorId`, la variante de §0 «El MCP entra después».                                                                                                                                                                                    | Por contrato.           |

## Revisiones

Seis revisiones sobre la rama rebasada en `main`, con E2b incluido. Veredictos: frontend, seguridad, paridad y backend **aprobado**; clean code **aprobado** con menores; tests **cambios requeridos**. El team-lead decidió cada hallazgo; la corrección del backend está en `d8cc35d`.

| Origen               | Hallazgo                                                                                                                        | Qué se hizo                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-1 (mayor), backend | `holdWorkspace` de `settings.integration.test.ts` escribía el `for no key update` a mano: un cambio del bloqueo real no lo veía | Aceptado. La barrera llama a `workspaceRepository.lockWorkspaceName`. El mutante `.for("update")` en `repository.ts` hace fallar «una invitación nueva» y «un alta de horas» del criterio 7.                 |
| T-2                  | Ningún test detectaba el `can()` previo a la transacción (§4.3, paso 1)                                                         | Aceptado. Un caso en «quién»: un member contra su membresía tomada con `holdMembership` responde `ForbiddenError` y no `blocked`. Sin el paso 1, falla con `blocked`.                                        |
| C-1                  | La relectura de la autoridad estaba escrita dentro de `updateWorkspaceName`                                                     | Aceptado. `assertCanUpdateSettingsLocked(tx, actor)`, al lado de `assertCanInviteLocked`, lanza `ForbiddenError("workspace.settings.update")`. El comentario del orden de los bloqueos queda donde se llama. |
| C-2                  | `actions.integration.test.ts` repetía el caso del mismo nombre en el del reintento                                              | Aceptado. Queda un caso que nombra WS-62 y el criterio 12: el reintento con espacios alrededor responde éxito, no toca la fila y deja una constancia.                                                        |
