# Kirikú

Estructura base del proyecto para el desarrollo colaborativo del sistema web de voluntariado.

## Tecnologías

- **Frontend:** Vue 3 (Composition API), TypeScript, Vite, Tailwind CSS, Pinia, Vue Router, Lucide Icons
- **Backend:** Node.js, Express, TypeScript
- **Base de Datos:** PostgreSQL en Supabase

## Tablas en Base de Datos (Supabase)

Toda la información y archivos multimedia se almacenan directamente en PostgreSQL en Supabase:

- `imagenes`: Almacenamiento de archivos binarios/base64 (`clave`, `nombre`, `tipo_mime`, `datos_base64`, `tamano_bytes`).
  - Endpoint de consulta directa: `GET /api/imagenes/:clave` (ej. `/api/imagenes/logo`).
  - Endpoint de guardado: `POST /api/imagenes`.
- `organizaciones`: Datos de ONGs, fundaciones o instituciones aliadas.
- `proyectos`: Convocatorias e iniciativas de voluntariado (`portada_url`, cupos, fechas, etc.).
- `postulantes`: Banco único de voluntarios registrados (`ci`, datos de contacto, habilidades).
- `postulaciones`: Vinculación de un postulante a un proyecto determinado con estado general.
- `evaluaciones_etapas`: Registro de las etapas de evaluación por postulación.
- `donaciones`: Libro de aportes económicos y donaciones en especie.

## Estructura de Archivos

```text
├── index.html                    # Entry point HTML
├── package.json                  # Dependencias y scripts
├── server.ts                     # Servidor Express Full-Stack
├── vite.config.ts                # Configuración de Vite
├── tsconfig.json                 # Configuración de TypeScript
├── src/
│   ├── main.ts                   # Inicialización de Vue, Pinia y Router
│   ├── App.vue                   # Shell principal con colores de marca
│   ├── index.css                 # Paleta de colores oficial de Kirikú
│   ├── vite-env.d.ts             # Declaraciones de tipos para .vue
│   ├── api/
│   │   └── client.ts             # Cliente Axios configurado para la API
│   ├── server/
│   │   ├── api.ts                # Rutas de la API REST (proyectos, postulaciones, imágenes, etc.)
│   │   └── supabase.ts           # Pool de conexión directa a PostgreSQL
│   ├── types/
│   │   └── index.ts              # Modelos e interfaces TypeScript
│   ├── stores/                   # Stores reactivos de Pinia
│   │   ├── projects.ts           # Gestión de proyectos
│   │   ├── applications.ts       # Gestión de postulaciones
│   │   └── donations.ts          # Gestión de donaciones
│   ├── router/
│   │   └── index.ts              # Rutas del sistema
│   ├── components/               # Componentes reutilizables
│   │   ├── Navbar.vue            # Barra de navegación superior
│   │   ├── AdultWarningModal.vue # Modal de mayoría de edad
│   │   ├── EvaluationStepper.vue # Stepper de etapas de evaluación
│   │   └── ProjectCard.vue       # Tarjeta de proyecto
│   └── views/                    # Vistas del sistema
│       ├── ProjectsCatalogView.vue   # Catálogo de proyectos
│       ├── ApplyView.vue             # Formulario de postulación
│       ├── ApplicationStatusView.vue # Consulta de estado de postulación
│       ├── ProposeProjectView.vue    # Registro de propuestas de proyectos
│       ├── DonationsView.vue         # Registro de donaciones
│       └── admin/
│           ├── AdminDashboardView.vue # Panel de administración
│           ├── ProjectReviewView.vue  # Revisión de proyectos
│           └── ApplicantsPoolView.vue # Banco de postulantes
```

## Ejecución Local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Iniciar servidor:
   ```bash
   npm run dev
   ```
   Disponible en `http://localhost:3000`.

3. Comprobar tipos y compilar:
   ```bash
   npm run lint
   npm run build
   ```

## Autenticación y roles administrativos

El panel administrativo usa Supabase Auth. Añade `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` a tu `.env` local (puedes partir de `.env.example`). No publiques ese archivo ni compartas sus valores. La clave `anon` puede usarse en el navegador; `SUPABASE_SERVICE_ROLE_KEY` es solo para el servidor y nunca debe tener el prefijo `VITE_`.

Antes del primer uso, crea la primera cuenta administradora en **Supabase → Authentication → Users** y aplica `supabase/migrations/202610190001_roles_permissions.sql` desde el SQL Editor. Para habilitar esa primera cuenta, cambia el correo de ejemplo en el bloque comentado al final de la migración y ejecútalo. Luego inicia sesión en `/login` y abre **Panel de Administración → Roles y permisos**. Desde esa pantalla puedes registrar cuentas adicionales: Supabase Auth les enviará una invitación y el rol queda asignado al aceptar.

La migración crea roles base (`administrador`, `evaluador`, `gestor_proyectos`) y permisos para revisión de proyectos, postulaciones, donaciones y gestión de roles. Las rutas administrativas verifican el token y el permiso en el servidor. El alta de cuentas requiere la clave `service_role` únicamente en el backend; la asignación de roles y las consultas usan `DATABASE_URL`.
