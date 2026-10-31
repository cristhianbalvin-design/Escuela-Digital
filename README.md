# Escuela Digital · Base

Aplicación Vite + React + TypeScript. Este directorio es independiente del prototipo de la raíz.

## Uso

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

En PowerShell con la ejecución de scripts deshabilitada, usa `npm.cmd` en lugar de `npm`.

Abre `http://localhost:5173/?tenant=tideo` o `http://localhost:5173/?tenant=udep-demo`. También funciona `http://tideo.localhost:5173/`. Cambiar el parámetro cambia la marca. En desarrollo, el selector de rol permite recorrer los cinco layouts.

## Estructura

- `src/app`: rutas, layouts y guard de rol para la experiencia de demostración.
- `src/features`: espacio para las funciones de los próximos pasos.
- `src/components/ui`: componentes y estados base.
- `src/lib`: escuela, marca, tema, i18n, Supabase y utilidades.
- `src/mocks`: solo las marcas de TIDEO y UDEP Demo.
- `public/icons`: copias de los iconos del prototipo.

## Entorno

Copia `.env.example` a `.env.local` si necesitas configurar `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_PLATFORM_ROOT_DOMAIN`. La base funciona sin credenciales. El adaptador de Supabase está preparado para la RPC `get_tenant_branding(host)` y no se utiliza de forma predeterminada. Su respuesta debe contener solo nombre, logos, colores, bienvenida, idioma y zona horaria.

## Decisiones

La escuela de la plataforma sin subdominio muestra TIDEO como ejemplo. Los dominios propios necesitan una fuente de marca que los reconozca; el mock solo reconoce los dos slugs. `RoleGuard` protege la navegación de demostración; la autorización real corresponderá a RLS. La PWA precachea archivos estáticos y no define caché en tiempo de ejecución. Las fuentes se empaquetan localmente. El aviso de actualización requiere acción del usuario. Las pantallas actuales son placeholders y no contienen datos del prototipo.
