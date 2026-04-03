# Tótem Interactivo EMBLAVEO

Aplicación web en `React + Vite + TypeScript` pensada para un tótem táctil vertical `1080x1920`.

## Qué incluye

- Flujo completo con máquina de estados en `XState`
- Consentimiento obligatorio antes de abrir la cámara
- Vista previa de webcam, guía de encuadre y captura con cuenta regresiva
- Revisión de foto con acciones de repetir o confirmar
- Simulación de impresión con arquitectura lista para integrar un adaptador real
- Manejo de errores de cámara y reset automático por inactividad

## Scripts

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test:run`

## Testing

La suite usa `Vitest` y `Testing Library` para cubrir:

- transiciones de la máquina de estados
- reset y limpieza de `objectURL`
- flujo de UI con `mediaDevices.getUserMedia` mockeado

## Branding

Los assets de logo actuales fueron derivados del manual de marca provisto y quedaron encapsulados para poder reemplazarlos por assets oficiales finales cuando sea necesario.
