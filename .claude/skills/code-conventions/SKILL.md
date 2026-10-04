---
name: code-conventions
description: Convenciones de código de Clock. Se precarga en todos los subagentes implementadores y reviewers. Se aplica a cualquier cambio en src/, e2e/ o drizzle/.
---

# Convenciones de Clock

Reglas acordadas para el proyecto. El reviewer `clean-code-reviewer` las hace
cumplir y un hallazgo contra esta lista es bloqueante.

## Marco y mecanismo

- Usar el mecanismo idiomático del framework antes que una implementación
  propia. Autenticación y permisos se resuelven en un punto central
  (`requireSession()` y `can()`), nunca con validaciones repetidas en cada
  endpoint.
- Comentarios, documentación, commits y descripciones de PR en registro técnico
  plano y declarativo, sin editorializar.

## TypeScript

- Modo strict. Sin `any`, sin aserciones de no nulo, sin silenciar al
  compilador. Una regla de ESLint deshabilitada lleva justificación en la misma
  línea.
- Sin estado mutable a nivel de módulo. La única excepción es el pool de
  conexiones de `src/server/db/index.ts`.
- Funciones con un solo propósito, retorno temprano y nombres que describen el
  dominio.
- Errores de dominio tipados con código. La action los traduce a un resultado
  para la interfaz; no se lanzan strings.
- Identificadores en inglés, textos de interfaz en español.
- Comentarios solo para explicar un motivo que el código no muestra.

## Capas

- Sin lógica de negocio en componentes ni en actions: las reglas viven en el
  service.
- El repository es el único lugar con acceso a datos, y toda consulta filtra por
  `workspace_id` tomado de la sesión, nunca de la entrada del cliente.
- Las tablas de la cuenta, sin `workspace_id` (como `user_preference`), son la
  excepción: filtran por el `user_id` de la sesión, nunca por uno que llegue en
  la entrada.
- Un service no importa de `app/` ni de `components/`. Un componente no importa
  un repository.
- Fechas, zonas horarias y duraciones solo a través de `src/server/time`.

## Datos

- Instantes en UTC como `timestamptz`. La zona horaria del usuario se aplica al
  mostrar y al calcular límites de día y semana.
- Importes en entero, en la unidad mínima de la moneda.
- Migraciones versionadas y reversibles, generadas con `npm run db:generate`.

## Tests

- Los tests viven junto al código que prueban, como `*.test.ts`.
- Afirman comportamiento, no implementación. Sin esperas fijas.
- Cada regla de permiso, bloqueo o aprobación tiene su caso.

## Entrega

- Un PR por slice vertical, con Conventional Commits.
- ESLint y Prettier obligatorios en CI.
