# Correcciones de WS1: revisiones

Registro de los desvíos del contrato
[`fase2-ws1-configuracion.md`](fase2-ws1-configuracion.md) y de lo que decidan
las revisiones. El team-lead decide cada fila.

## Desvíos de la implementación

| Origen      | Desvío                                                                                                                                                                                                                                                                                                                  | Decisión y dueño |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| backend-dev | §9.2 pide los criterios 1 a 4 sobre el service; **el 3 (validaciones) no va sobre el service**, que recibe la entrada ya parseada. Va en `schema.test.ts` (cada caso, el recorte y el mensaje) y en `actions.integration.test.ts` (cada caso con `validation`, su texto y que no escribe).                              | Pendiente.       |
| backend-dev | El paso 1 de §4.3 (`can()` antes de abrir la transacción) **no tiene un test que lo mate**: sin él, la relectura del paso 2 responde el mismo `ForbiddenError` sin escribir, y ningún test observa si la transacción se abrió. Es la misma forma que `inviteMembers`.                                                   | Pendiente.       |
| backend-dev | El caso «workspace ajeno» del service (`settings.integration.test.ts`) prueba la relectura: un actor con el `workspaceId` de otro workspace, sin membresía ahí, recibe `ForbiddenError` y no escribe en ninguno. La comparación de workspace de `can()` para `workspace.settings.update` la fija `permissions.test.ts`. | Pendiente.       |
| backend-dev | El MCP no está en `main` (`eb2ba2d`): la constancia se arma con `workspaceId` y `actorId`, la variante de §0 «El MCP entra después».                                                                                                                                                                                    | Por contrato.    |
