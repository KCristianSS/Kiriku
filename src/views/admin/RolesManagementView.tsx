import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { supabaseAuth } from '../../auth';
import {
  KeyRound,
  UserPlus,
  Edit3,
  Check,
  X,
  LogOut,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

type Permission = { id: number; code: string; name: string; description?: string };
type Role = { id: number | string; code: string; name: string; description: string; active: boolean; permissions: Permission[] };
type RoleUser = { id: string; email: string; roles: Array<{ id: number | string; name: string }> };

export const RolesManagementView: React.FC = () => {
  const navigate = useNavigate();

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [queryText, setQueryText] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState<number | string | null>(null);

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<number | string | null>(null);

  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const currentUserEmail = useMemo(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('kiriku_user_email') || 'admin@kiriku.org';
    }
    return 'admin@kiriku.org';
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [rolesData, permsData, usersData] = await Promise.all([
        api.getRoles(),
        api.getRolePermissions(),
        api.getRoleUsers(queryText),
      ]);
      setRoles(rolesData);
      setPermissions(permsData);
      setUsers(usersData);
    } catch (e: any) {
      setError(e.response?.data?.error || 'No se pudo cargar la gestión de roles.');
    } finally {
      setBusy(false);
    }
  }, [queryText]);

  useEffect(() => {
    load();
  }, [load]);

  const edit = (role: Role) => {
    setEditingId(role.id);
    setCode(role.code);
    setName(role.name);
    setDescription(role.description);
    setSelectedPermissions((role.permissions || []).map((p) => p.code));
    setNotice(`Modo edición activado para el rol: "${role.name}". Realiza los cambios y pulsa "Guardar cambios".`);

    setTimeout(() => {
      const el = document.getElementById('role-form-card');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const onNameChange = (val: string) => {
    setName(val);
    if (!editingId) {
      const slug = val
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      setCode(slug);
    }
  };

  const reset = () => {
    setEditingId(null);
    setCode('');
    setName('');
    setDescription('');
    setSelectedPermissions([]);
  };

  const saveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (editingId !== null) {
        const role = roles.find((entry) => String(entry.id) === String(editingId));
        await api.updateRole(Number(editingId), {
          name: name.trim(),
          description: description.trim(),
          active: role ? role.active : true,
          permission_codes: selectedPermissions,
        });
        setNotice(`¡Rol "${name}" actualizado correctamente con sus permisos!`);
      } else {
        await api.createRole({
          code: code.trim().toLowerCase(),
          name: name.trim(),
          description: description.trim(),
          permission_codes: selectedPermissions,
        });
        setNotice(`¡Nuevo rol "${name}" creado exitosamente!`);
      }
      reset();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No se pudo guardar el rol.');
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    if (!selectedUser || selectedRole === null) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api.assignRole(selectedUser, Number(selectedRole));
      setNotice('Rol asignado al usuario con éxito en la base de datos.');
      setSelectedUser('');
      setSelectedRole(null);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No se pudo asignar el rol.');
    } finally {
      setBusy(false);
    }
  };

  const registerUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || newUserRole === null) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api.registerRoleUser({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        role_id: Number(newUserRole),
      });
      setNotice(result.message || 'Usuario registrado exitosamente y rol asignado.');
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole(null);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No se pudo registrar el usuario.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('kiriku_admin_token');
      localStorage.removeItem('kiriku_user_email');
    }
    try {
      if (supabaseAuth) {
        await supabaseAuth.auth.signOut();
      }
    } catch {}
    navigate('/login');
  };

  const togglePermission = (permCode: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permCode) ? prev.filter((c) => c !== permCode) : [...prev, permCode]
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header with User and Logout */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-2">
            <KeyRound className="w-3.5 h-3.5 text-[#289EAB]" />
            <span>Control de Acceso RBAC (KIR-11 & KIR-6)</span>
          </div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Roles y Permisos</h1>
          <p className="mt-1 text-sm text-stone-600">
            Gestiona los perfiles del sistema, edita sus permisos y asigna roles a los usuarios registrados.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <span className="text-xs text-stone-400 block">Conectado como</span>
            <span className="text-xs font-bold text-stone-700 font-mono">{currentUserEmail}</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-red-50 hover:text-red-700 text-stone-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-stone-200"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4 text-red-500" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </header>

      {/* Notices & Errors */}
      {notice && (
        <div role="status" className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center gap-3 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. GESTIÓN Y EDICIÓN DE ROLES */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* FORMULARIO CREAR / EDITAR ROL */}
        <form
          id="role-form-card"
          onSubmit={saveRole}
          className={`rounded-3xl border bg-white p-6 sm:p-7 space-y-4 shadow-xs transition-all ${
            editingId !== null ? 'border-[#F58F38] ring-2 ring-[#F58F38]/20 bg-amber-50/20' : 'border-stone-200'
          }`}
        >
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-100">
            <div>
              {editingId && (
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold uppercase tracking-wider mb-1">
                  Modo Edición Activado
                </span>
              )}
              <h2 className="text-lg font-bold text-stone-900">
                {editingId ? 'Editar Rol Seleccionado' : 'Crear Nuevo Rol'}
              </h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={reset}
                className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Nombre del Rol *</label>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              required
              placeholder="ej. Coordinador de Salud Comunitario"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none"
            />
            {!editingId && (
              <p className="text-[11px] text-stone-400 mt-1">
                Código interno del sistema (automático):{' '}
                <span className="font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded text-[10px]">
                  {code || 'se generará al escribir el nombre'}
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe las responsabilidades de este perfil..."
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none"
            ></textarea>
          </div>

          <fieldset className="space-y-2 pt-2 border-t border-stone-100">
            <legend className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-2">Permisos asignados al rol</legend>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {permissions.map((permission) => (
                <label
                  key={permission.code}
                  className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-stone-50 cursor-pointer border border-transparent hover:border-stone-200 transition-all text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(permission.code)}
                    onChange={() => togglePermission(permission.code)}
                    className="mt-0.5 accent-[#289EAB] w-4 h-4 rounded"
                  />
                  <div>
                    <span className="font-bold text-stone-900 block">{permission.name}</span>
                    <span className="text-stone-500 text-[11px]">{permission.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="pt-2">
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[#289EAB] hover:bg-[#1E7B85] px-4 py-2.5 font-bold text-white text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{busy ? 'Guardando…' : editingId ? 'Guardar Cambios del Rol' : 'Crear Rol'}</span>
            </button>
          </div>
        </form>

        {/* LISTA DE ROLES CONFIGURADOS */}
        <section className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h2 className="text-lg font-bold text-stone-900">Roles Configurados en BD</h2>
            <button
              type="button"
              onClick={load}
              disabled={busy}
              className="px-2.5 py-1 text-xs text-stone-500 hover:text-stone-800 rounded-lg flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>

          {!roles.length && (
            <p className="text-sm text-stone-500 py-6 text-center">
              {busy ? 'Cargando roles desde Supabase…' : 'No hay roles configurados.'}
            </p>
          )}

          <div className="space-y-3">
            {roles.map((role) => (
              <article
                key={role.id}
                className={`rounded-2xl border p-4 transition-all ${
                  String(editingId) === String(role.id)
                    ? 'border-[#F58F38] bg-amber-50/40 ring-2 ring-[#F58F38]/30'
                    : 'border-stone-200 hover:border-stone-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-stone-900">{role.name}</h3>
                      <span className="text-[11px] font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                        {role.code}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 mt-1">{role.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => edit(role)}
                    className="px-3 py-1.5 rounded-xl bg-[#E8F6F8] hover:bg-[#289EAB] text-[#1E7B85] hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{String(editingId) === String(role.id) ? 'Editando…' : 'Editar'}</span>
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {role.permissions?.map((perm) => (
                    <span
                      key={perm.code}
                      className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700"
                    >
                      {perm.name}
                    </span>
                  ))}
                  {(!role.permissions || !role.permissions.length) && (
                    <span className="text-[11px] text-stone-400 italic">
                      Sin permisos asignados
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      {/* 2. REGISTRAR USUARIOS DEL SISTEMA (KIR-6 / RF-01) */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 space-y-4 shadow-xs">
        <div className="pb-3 border-b border-stone-100">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold mb-2">
            <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Historia KIR-6: Registrar usuarios del sistema (RF-01)</span>
          </div>
          <h2 className="text-lg font-bold text-stone-900">Registrar Nuevo Usuario y Asignarle Rol</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Crea la cuenta en Supabase (`auth.users` y `public.usuarios`) y le asigna su rol activo de forma simultánea.
          </p>
        </div>

        <form onSubmit={registerUser} className="grid gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Nombre completo *</label>
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="ej. Dra. Claudia Morales"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Correo electrónico *</label>
            <input
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              required
              type="email"
              placeholder="claudia@kiriku.org"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Rol a asignar *</label>
            <select
              value={newUserRole === null ? '' : newUserRole}
              onChange={(e) => setNewUserRole(e.target.value ? Number(e.target.value) : null)}
              required
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none bg-white cursor-pointer"
            >
              <option value="" disabled>Selecciona un rol</option>
              {roles.filter((entry) => entry.active).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3 flex justify-end pt-2">
            <button
              type="submit"
              disabled={busy || newUserRole === null || !newUserName.trim() || !newUserEmail.trim()}
              className="px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>{busy ? 'Registrando…' : 'Registrar Usuario y Asignar Rol'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* 3. ASIGNAR / CAMBIAR ROL DE CUENTAS EXISTENTES */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 space-y-4 shadow-xs">
        <div className="pb-3 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Cuentas Registradas en la BD y sus Roles</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Busca una cuenta existente y cámbiale su rol de inmediato en Supabase.
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex items-center gap-2">
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              type="search"
              placeholder="Buscar por correo..."
              className="rounded-xl border border-stone-300 px-3 py-1.5 text-xs focus:border-[#289EAB] focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold cursor-pointer"
            >
              Buscar
            </button>
          </form>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end p-4 bg-stone-50 rounded-2xl border border-stone-200">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Seleccionar cuenta</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none bg-white cursor-pointer"
            >
              <option value="">Selecciona un usuario...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Nuevo rol</label>
            <select
              value={selectedRole === null ? '' : selectedRole}
              onChange={(e) => setSelectedRole(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none bg-white cursor-pointer"
            >
              <option value="">Selecciona un rol...</option>
              {roles.filter((entry) => entry.active).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={assign}
              disabled={!selectedUser || selectedRole === null || busy}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#289EAB] hover:bg-[#1E7B85] text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              Cambiar Rol
            </button>
          </div>
        </div>

        {/* Tabla de usuarios y sus roles asignados */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-stone-200 text-stone-400 uppercase tracking-wider font-semibold">
                <th className="py-2.5 px-3">Correo Electrónico</th>
                <th className="py-2.5 px-3">Roles Asignados</th>
                <th className="py-2.5 px-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-stone-50/80 transition-colors">
                  <td className="py-3 px-3 font-semibold text-stone-900 font-mono">{user.email}</td>
                  <td className="py-3 px-3">
                    {user.roles.map((r) => (
                      <span
                        key={r.id}
                        className="inline-block px-2.5 py-0.5 rounded-full bg-[#E8F6F8] text-[#1E7B85] font-bold text-[11px] mr-1.5"
                      >
                        {r.name}
                      </span>
                    ))}
                    {!user.roles.length && <span className="text-stone-400 italic">Sin rol</span>}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedUser(user.id)}
                      className="text-xs text-[#1E7B85] hover:underline font-semibold cursor-pointer"
                    >
                      Seleccionar para cambiar rol
                    </button>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-stone-400">
                    No hay usuarios cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default RolesManagementView;
