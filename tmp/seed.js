const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ucb_sistemas2026@db.zijlhvezhtgzdgojstbk.supabase.co:5432/postgres',
});

async function run() {
  const users = [
    { email: 'admin@kiriku.org', name: 'Administrador Principal', roleCode: 'administrador' },
    { email: 'guillermosancalli86@gmail.com', name: 'Guillermo Sancalli', roleCode: 'administrador' },
    { email: 'evaluador@kiriku.org', name: 'Lic. Mariana Ramos (Evaluadora)', roleCode: 'evaluador' },
    { email: 'gestor@kiriku.org', name: 'Ing. Carlos Mendoza (Gestor)', roleCode: 'gestor_proyectos' },
  ];

  for (const u of users) {
    const existing = await pool.query('SELECT id FROM auth.users WHERE email = $1', [u.email]);
    let userId;
    if (existing.rows.length === 0) {
      const ins = await pool.query(
        `INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
         VALUES (gen_random_uuid(), 'authenticated', 'authenticated', $1, json_build_object('full_name', $2), json_build_object('provider', 'email', 'providers', array['email']), NOW(), NOW())
         RETURNING id`,
        [u.email, u.name]
      );
      userId = ins.rows[0].id;
    } else {
      userId = existing.rows[0].id;
    }

    const roleRow = await pool.query('SELECT id FROM roles WHERE code = $1', [u.roleCode]);
    if (roleRow.rows.length > 0) {
      const roleId = roleRow.rows[0].id;
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, roleId]
      );
    }

    try {
      await pool.query(
        `INSERT INTO usuarios (nombre, email, rol, activo, created_at)
         VALUES ($1, $2, $3, TRUE, NOW())
         ON CONFLICT DO NOTHING`,
        [u.name, u.email, u.roleCode]
      );
    } catch (e) {
      console.warn('usuarios insert err:', e.message);
    }
  }

  const allAuth = await pool.query('SELECT id, email, created_at FROM auth.users');
  console.log('auth.users successfully seeded:', allAuth.rows);

  const allUr = await pool.query(
    `SELECT u.email, r.name as rol_asignado
     FROM user_roles ur
     JOIN auth.users u ON u.id = ur.user_id
     JOIN roles r ON r.id = ur.role_id`
  );
  console.log('user_roles joined:', allUr.rows);

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
