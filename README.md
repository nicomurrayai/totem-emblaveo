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

## Supabase

1. Copiá `.env.example` a `.env` y completá `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_SUPABASE_BUCKET` si querés cambiar el bucket por defecto.
2. Ejecutá [supabase/setup.sql](/C:/Users/nicol/OneDrive/Desktop/DESARROLLOS%20EN%20PROCESO/totem-emblaveo/supabase/setup.sql) en el SQL Editor de Supabase para crear el bucket público `kiosk-photos`, la tabla `kiosk_photos` y las políticas mínimas de upload e insert.
3. Cuando la persona confirma la foto, la app la sube a Storage y guarda solamente la URL pública en `public.kiosk_photos`.

## Testing

La suite usa `Vitest` y `Testing Library` para cubrir:

- transiciones de la máquina de estados
- reset y limpieza de `objectURL`
- flujo de UI con `mediaDevices.getUserMedia` mockeado
- archivado de la foto confirmada en Supabase

## Branding

Los assets de logo actuales fueron derivados del manual de marca provisto y quedaron encapsulados para poder reemplazarlos por assets oficiales finales cuando sea necesario.
