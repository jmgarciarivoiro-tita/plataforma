# ADR 0013 — El gateway monta los módulos desde el mapa del deployer

- Estado: aceptado (17/11/2026) · Incremento I4-2b

## Contexto

Desde I4-2a el deployer levanta cada módulo en un puerto local y escribe
`infra/local/estado/despliegues.<entorno>.json`. El gateway seguía leyendo solo `GATEWAY_MODULOS`, así
que un módulo desplegado por el pipeline no aparecía en el Shell sin editar el `.env` y reiniciar.

## Decisión

- Nueva variable `GATEWAY_MAPA_PATH`. Si está, el gateway usa `ModulosDesplegados`: los módulos fijos de
  `GATEWAY_MODULOS` (desarrollo local, por ejemplo `modulo-ejemplo`) más los del mapa.
- **Recarga en caliente** por `mtime`, en cada request, con el mismo patrón que los roles (ADR 0004): sin
  timers ni watchers (el deployer reemplaza el archivo con un rename atómico, que rompe `fs.watch`).
- Validación estricta del mapa: id de módulo, digest `sha256:` y **URL solo `http://127.0.0.1`,
  `localhost` o `[::1]`, sin ruta**. El gateway le manda a ese destino un JWT del usuario: un mapa
  adulterado no puede desviarlo a otro host.
- Si un cambio es inválido, se conserva la última versión válida y se registra el error. Si el archivo
  desaparece, quedan solo los módulos fijos.
- Si un id está en los dos lugares, **gana el del deployer** (pasó por el pipeline) y se avisa en el log.
- Con el mapa configurado, el gateway queda activo aunque todavía no haya módulos.

## Consecuencias

- El Shell sigue mostrando solo los módulos del registry en los que el usuario tiene rol: el mapa monta,
  los roles autorizan.
- El mapa vive en la misma PC que la API (MVP). Con la API en contenedor, las URLs `127.0.0.1` no
  alcanzan los módulos: se resuelve con una red de Docker compartida cuando la plataforma salga de la PC.
- Producción tendrá su propio mapa (`despliegues.production.json`) y su propia instancia de la API (I4-3).
