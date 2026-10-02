# 0002. Cabeceras de seguridad con CSP permisiva en scripts

Fecha: 2026-10-02. Estado: aceptado, con deuda registrada.

## Contexto

El plan exige CSP, X-Frame-Options, Referrer-Policy y HSTS. Next.js inyecta
scripts en línea para la hidratación; una CSP estricta necesita un nonce por
respuesta, que se genera en un middleware y se propaga al documento.

## Decisión

La fase 0 fija todas las cabeceras en `next.config.ts` con una CSP cuyo
`script-src` acepta `'unsafe-inline'`. El middleware con nonce queda pendiente.

## Consecuencias

- Las cabeceras están en producción desde el primer despliegue.
- `script-src 'unsafe-inline'` no protege contra XSS inyectado. La mitigación
  real sigue siendo que toda salida pase por React y que no exista
  `dangerouslySetInnerHTML`.
- Queda una tarea para la fase 1: middleware con nonce y `strict-dynamic`, y la
  verificación correspondiente en `security-auditor`.
