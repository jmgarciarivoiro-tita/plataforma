# ADR 0007 — Organización de GitHub para el MVP

- Estado: aceptado (15/11/2026) · Corresponde a ADR-106 del diseño.

## Contexto

I2 necesita crear repos de módulos automáticamente desde la plantilla. Un token de instalación de
una GitHub App no puede crear repos en una cuenta personal, solo en organizaciones. En una cuenta
personal, además, cada repo nuevo requiere invitar al revisor y que acepte a mano.

## Decisión

- El repo `plataforma` se transfiere a la organización gratuita `plataforma-mvp-jmg`, cuyo owner es
  la cuenta autor.
- Los revisores forman el team `sistemas`, code owner de todo. El autor no es miembro del team.
- Los miembros no pueden crear repos; solo los owners y la App de aprovisionamiento.

## Consecuencias

- Mismo modelo que la Fase 1.5 corporativa (org + teams); sin invitaciones por repo.
- En el plan gratuito, rulesets y revisores obligatorios de environments solo existen en repos
  públicos: los módulos del MVP son públicos y usan solo datos sintéticos (P7).
- La transferencia apagó secret scanning y push protection; se reactivaron y se agregó la
  verificación al README.
