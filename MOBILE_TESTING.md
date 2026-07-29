# MOBILE_TESTING.md — Probar la PWA como app móvil de verdad

Esta guía cubre cómo llevar la PWA de "archivos en una carpeta" a "app instalada en tu celular".

## Camino rápido (Android + Chrome)

1. En la carpeta del proyecto, levantar un servidor local:
   ```bash
   python3 -m http.server 8000
   ```
2. Conectar el celular por USB y habilitar Depuración USB.
3. En Chrome de escritorio, abrir `chrome://inspect#devices`.
4. Añadir forwarding para el puerto `8000` -> `localhost:8000`.
5. Abrir `http://localhost:8000/pwa/index.html` desde el navegador del celular.
6. Instalar la app desde el navegador y probarla como aplicación instalada.

## Camino de producción

Para iPhone y para una experiencia real de instalación, la app debe servirse sobre HTTPS real (por ejemplo GitHub Pages).

## Verificaciones importantes

- La app debe abrirse en modo standalone.
- Los íconos y fuentes deben cargarse sin fallback.
- La app debe seguir funcionando offline una vez instalada.
- La primera apertura debe permitir desbloquear el bundle cifrado.

