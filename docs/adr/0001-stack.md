# 0001. Next.js full-stack en Vercel

Fecha: 2026-10-02. Estado: aceptado.

## Contexto

La aplicación tiene que cubrir carga de horas y administración con paridad
funcional con Clockify, con login de Google y despliegue en Vercel. El equipo
evaluó un backend en Python con frontend en React.

## Decisión

Un solo proyecto Next.js en TypeScript, con App Router y server actions, sobre
Postgres serverless en Neon con Drizzle, Better Auth para la sesión y Zod en el
borde de cada entrada.

## Consecuencias

- Un único despliegue y una única sesión, sin CORS ni tipos duplicados.
- El equipo trabaja en TypeScript en las dos capas.
- No hay proceso persistente: el timer activo es una entrada con `end` nulo y
  el estado vive en la base.
- Los trabajos programados dependen del cron de Vercel, con las limitaciones del
  plan Hobby.
