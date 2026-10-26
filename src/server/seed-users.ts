import { query, dbPool } from './supabase';

async function seed() {
  await query('ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check');
  await query(
    `ALTER TABLE public.usuarios 
     ADD CONSTRAINT usuarios_rol_check 
     CHECK (rol::text = ANY (ARRAY['admin', 'administrador', 'coordinador', 'evaluador', 'gestor_proyectos', 'voluntario']::text[]))`
  );

  const users = [
    { email: 'admin@kiriku.org', name: 'Administrador Principal', roleCode: 'administrador' },
    { email: 'guillermosancalli86@gmail.com', name: 'Guillermo Sancalli', roleCode: 'administrador' },
    { email: 'evaluador@kiriku.org', name: 'Lic. Mariana Ramos (Evaluadora)', roleCode: 'evaluador' },
    { email: 'gestor@kiriku.org', name: 'Ing. Carlos Mendoza (Gestor)', roleCode: 'gestor_proyectos' },
  ];

  for (const u of users) {
    const existing = await query<{ id: string }>(
      'SELECT id FROM auth.users WHERE email = $1 LIMIT 1',
      [u.email]
    );

    let userId: string;
    if (existing.length === 0) {
      const ins = await query<{ id: string }>(
        `INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
         VALUES (gen_random_uuid(), 'authenticated', 'authenticated', $1, json_build_object('full_name', $2::text), json_build_object('provider', 'email', 'providers', array['email']), NOW(), NOW())
         RETURNING id`,
        [u.email, u.name]
      );
      userId = ins[0].id;
    } else {
      userId = existing[0].id;
    }

    const roleRow = await query<{ id: number }>('SELECT id FROM roles WHERE code = $1', [u.roleCode]);
    if (roleRow.length > 0) {
      await query(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, roleRow[0].id]
      );
    }

    try {
      await query(
        `INSERT INTO usuarios (id, nombre, email, password, rol, activo, created_at, updated_at)
         VALUES ($1, $2, $3, 'Admin123!', $4, TRUE, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, nombre = EXCLUDED.nombre`,
        [userId, u.name, u.email, u.roleCode]
      );
    } catch (e: any) {
      console.warn('public.usuarios insert info:', e.message);
    }
  }

  const allAuth = await query('SELECT id, email, created_at FROM auth.users');
  console.log('auth.users successfully seeded:', allAuth);

  const allUr = await query(
    `SELECT u.email, r.name as rol_asignado
     FROM user_roles ur
     JOIN auth.users u ON u.id = ur.user_id
     JOIN roles r ON r.id = ur.role_id`
  );
  console.log('user_roles joined:', allUr);

  const allPub = await query('SELECT id, nombre, email, rol, activo FROM public.usuarios');
  console.log('public.usuarios rows count:', allPub.length, allPub);

  await dbPool.end();
}

seed().catch(console.error);
