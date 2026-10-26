<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/client';
import { supabaseAuth } from '../../auth';
import {
  ShieldCheck,
  KeyRound,
  UserPlus,
  Edit3,
  Check,
  X,
  LogOut,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
} from 'lucide-vue-next';

type Permission = { id: number; code: string; name: string; description?: string };
type Role = { id: number | string; code: string; name: string; description: string; active: boolean; permissions: Permission[] };
type RoleUser = { id: string; email: string; roles: Array<{ id: number | string; name: string }> };

const router = useRouter();

const roles = ref<Role[]>([]);
const permissions = ref<Permission[]>([]);
const users = ref<RoleUser[]>([]);
const queryText = ref('');
const selectedUser = ref('');
const selectedRole = ref<number | string | null>(null);

const newUserName = ref('');
const newUserEmail = ref('');
const newUserRole = ref<number | string | null>(null);

const editingId = ref<number | string | null>(null);
const code = ref('');
const name = ref('');
const description = ref('');
const selectedPermissions = ref<string[]>([]);

const error = ref('');
const notice = ref('');
const busy = ref(false);

const currentUserEmail = computed(() => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('kiriku_user_email') || 'admin@kiriku.org';
  }
  return 'admin@kiriku.org';
});

async function load() {
  busy.value = true;
  error.value = '';
  try {
    const [rolesData, permsData, usersData] = await Promise.all([
      api.getRoles(),
      api.getRolePermissions(),
      api.getRoleUsers(queryText.value),
    ]);
    roles.value = rolesData;
    permissions.value = permsData;
    users.value = usersData;
  } catch (e: any) {
    error.value = e.response?.data?.error || 'No se pudo cargar la gestión de roles.';
  } finally {
    busy.value = false;
  }
}

function edit(role: Role) {
  editingId.value = role.id;
  code.value = role.code;
  name.value = role.name;
  description.value = role.description;
  selectedPermissions.value = (role.permissions || []).map((permission) => permission.code);
  notice.value = `Modo edición activado para el rol: "${role.name}". Realiza los cambios y pulsa "Guardar cambios".`;
  
  // Desplazar suavemente hacia el formulario
  setTimeout(() => {
    const el = document.getElementById('role-form-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 50);
}

function onNameInput() {
  if (!editingId.value) {
    code.value = name.value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}

function reset() {
  editingId.value = null;
  code.value = '';
  name.value = '';
  description.value = '';
  selectedPermissions.value = [];
}

async function saveRole() {
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    if (editingId.value !== null) {
      const role = roles.value.find((entry) => String(entry.id) === String(editingId.value));
      await api.updateRole(Number(editingId.value), {
        name: name.value.trim(),
        description: description.value.trim(),
        active: role ? role.active : true,
        permission_codes: selectedPermissions.value,
      });
      notice.value = `¡Rol "${name.value}" actualizado correctamente con sus permisos!`;
    } else {
      await api.createRole({
        code: code.value.trim().toLowerCase(),
        name: name.value.trim(),
        description: description.value.trim(),
        permission_codes: selectedPermissions.value,
      });
      notice.value = `¡Nuevo rol "${name.value}" creado exitosamente!`;
    }
    reset();
    await load();
  } catch (e: any) {
    error.value = e.response?.data?.error || 'No se pudo guardar el rol.';
  } finally {
    busy.value = false;
  }
}

async function assign() {
  if (!selectedUser.value || selectedRole.value === null) return;
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    await api.assignRole(selectedUser.value, Number(selectedRole.value));
    notice.value = 'Rol asignado al usuario con éxito en la base de datos.';
    selectedUser.value = '';
    selectedRole.value = null;
    await load();
  } catch (e: any) {
    error.value = e.response?.data?.error || 'No se pudo asignar el rol.';
  } finally {
    busy.value = false;
  }
}

async function registerUser() {
  if (!newUserName.value.trim() || !newUserEmail.value.trim() || newUserRole.value === null) return;
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    const result = await api.registerRoleUser({
      name: newUserName.value.trim(),
      email: newUserEmail.value.trim(),
      role_id: Number(newUserRole.value),
    });
    notice.value = result.message || 'Usuario registrado exitosamente y rol asignado.';
    newUserName.value = '';
    newUserEmail.value = '';
    newUserRole.value = null;
    await load();
  } catch (e: any) {
    error.value = e.response?.data?.error || 'No se pudo registrar el usuario.';
  } finally {
    busy.value = false;
  }
}

async function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('kiriku_admin_token');
    localStorage.removeItem('kiriku_user_email');
  }
  try {
    if (supabaseAuth) {
      await supabaseAuth.auth.signOut();
    }
  } catch {
    // Ignorar si no había sesión en supabaseAuth
  }
  router.push('/login');
}

onMounted(load);
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
    <!-- Header with User and Logout -->
    <header class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-stone-200">
      <div>
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-2">
          <KeyRound class="w-3.5 h-3.5 text-[#289EAB]" />
          <span>Control de Acceso RBAC (KIR-11 & KIR-6)</span>
        </div>
        <h1 class="text-3xl font-extrabold text-stone-900 tracking-tight">Roles y Permisos</h1>
        <p class="mt-1 text-sm text-stone-600">
          Gestiona los perfiles del sistema, edita sus permisos y asigna roles a los usuarios registrados.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <div class="hidden sm:block text-right">
          <span class="text-xs text-stone-400 block">Conectado como</span>
          <span class="text-xs font-bold text-stone-700 font-mono">{{ currentUserEmail }}</span>
        </div>
        <button
          @click="logout"
          class="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-red-50 hover:text-red-700 text-stone-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-stone-200"
          title="Cerrar sesión"
        >
          <LogOut class="w-4 h-4 text-red-500" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </header>

    <!-- Notices & Errors -->
    <div v-if="notice" role="status" class="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center gap-3 shadow-xs">
      <CheckCircle2 class="w-5 h-5 text-emerald-600 shrink-0" />
      <span>{{ notice }}</span>
    </div>

    <div v-if="error" role="alert" class="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-3 shadow-xs">
      <AlertCircle class="w-5 h-5 text-red-600 shrink-0" />
      <span>{{ error }}</span>
    </div>

    <!-- 1. GESTIÓN Y EDICIÓN DE ROLES -->
    <section class="grid gap-6 lg:grid-cols-2">
      <!-- FORMULARIO CREAR / EDITAR ROL -->
      <form
        id="role-form-card"
        @submit.prevent="saveRole"
        :class="[
          'rounded-3xl border bg-white p-6 sm:p-7 space-y-4 shadow-xs transition-all',
          editingId !== null ? 'border-[#F58F38] ring-2 ring-[#F58F38]/20 bg-amber-50/20' : 'border-stone-200'
        ]"
      >
        <div class="flex items-center justify-between gap-3 pb-3 border-b border-stone-100">
          <div>
            <span v-if="editingId" class="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold uppercase tracking-wider mb-1">
              Modo Edición Activado
            </span>
            <h2 class="text-lg font-bold text-stone-900">
              {{ editingId ? 'Editar Rol Seleccionado' : 'Crear Nuevo Rol' }}
            </h2>
          </div>
          <button
            v-if="editingId"
            type="button"
            @click="reset"
            class="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
          >
            <X class="w-3.5 h-3.5" />
            <span>Cancelar</span>
          </button>
        </div>

        <div>
          <label class="block text-xs font-semibold text-stone-700 mb-1">Nombre del Rol *</label>
          <input
            v-model="name"
            @input="onNameInput"
            required
            placeholder="ej. Coordinador de Salud Comunitario"
            class="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none"
          />
          <p v-if="!editingId" class="text-[11px] text-stone-400 mt-1">
            Código interno del sistema (automático):
            <span class="font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded text-[10px]">
              {{ code || 'se generará al escribir el nombre' }}
            </span>
          </p>
        </div>

        <div>
          <label class="block text-xs font-semibold text-stone-700 mb-1">Descripción</label>
          <textarea
            v-model="description"
            rows="2"
            placeholder="Describe las responsabilidades de este perfil..."
            class="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none"
          ></textarea>
        </div>

        <fieldset class="space-y-2 pt-2 border-t border-stone-100">
          <legend class="text-xs font-bold text-stone-800 uppercase tracking-wider mb-2">Permisos asignados al rol</legend>
          <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
            <label
              v-for="permission in permissions"
              :key="permission.code"
              class="flex items-start gap-2.5 p-2 rounded-xl hover:bg-stone-50 cursor-pointer border border-transparent hover:border-stone-200 transition-all text-xs"
            >
              <input
                v-model="selectedPermissions"
                type="checkbox"
                :value="permission.code"
                class="mt-0.5 accent-[#289EAB] w-4 h-4 rounded"
              />
              <div>
                <span class="font-bold text-stone-900 block">{{ permission.name }}</span>
                <span class="text-stone-500 text-[11px]">{{ permission.description }}</span>
              </div>
            </label>
          </div>
        </fieldset>

        <div class="pt-2">
          <button
            :disabled="busy"
            class="w-full rounded-xl bg-[#289EAB] hover:bg-[#1E7B85] px-4 py-2.5 font-bold text-white text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Check class="w-4 h-4" />
            <span>{{ busy ? 'Guardando…' : (editingId ? 'Guardar Cambios del Rol' : 'Crear Rol') }}</span>
          </button>
        </div>
      </form>

      <!-- LISTA DE ROLES CONFIGURADOS -->
      <section class="rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 space-y-4 shadow-xs">
        <div class="flex items-center justify-between pb-3 border-b border-stone-100">
          <h2 class="text-lg font-bold text-stone-900">Roles Configurados en BD</h2>
          <button
            @click="load"
            :disabled="busy"
            class="px-2.5 py-1 text-xs text-stone-500 hover:text-stone-800 rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw :class="['w-3.5 h-3.5', busy ? 'animate-spin' : '']" />
            <span>Actualizar</span>
          </button>
        </div>

        <p v-if="!roles.length" class="text-sm text-stone-500 py-6 text-center">
          {{ busy ? 'Cargando roles desde Supabase…' : 'No hay roles configurados.' }}
        </p>

        <div class="space-y-3">
          <article
            v-for="role in roles"
            :key="role.id"
            :class="[
              'rounded-2xl border p-4 transition-all',
              String(editingId) === String(role.id)
                ? 'border-[#F58F38] bg-amber-50/40 ring-2 ring-[#F58F38]/30'
                : 'border-stone-200 hover:border-stone-300 bg-white'
            ]"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-bold text-sm text-stone-900">{{ role.name }}</h3>
                  <span class="text-[11px] font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                    {{ role.code }}
                  </span>
                </div>
                <p class="text-xs text-stone-600 mt-1">{{ role.description }}</p>
              </div>

              <button
                @click="edit(role)"
                class="px-3 py-1.5 rounded-xl bg-[#E8F6F8] hover:bg-[#289EAB] text-[#1E7B85] hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Edit3 class="w-3.5 h-3.5" />
                <span>{{ String(editingId) === String(role.id) ? 'Editando…' : 'Editar' }}</span>
              </button>
            </div>

            <div class="mt-3 flex flex-wrap gap-1">
              <span
                v-for="perm in role.permissions"
                :key="perm.code"
                class="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700"
              >
                {{ perm.name }}
              </span>
              <span v-if="!role.permissions || !role.permissions.length" class="text-[11px] text-stone-400 italic">
                Sin permisos asignados
              </span>
            </div>
          </article>
        </div>
      </section>
    </section>

    <!-- 2. REGISTRAR USUARIOS DEL SISTEMA (KIR-6 / RF-01) -->
    <section class="rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 space-y-4 shadow-xs">
      <div class="pb-3 border-b border-stone-100">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold mb-2">
          <UserPlus class="w-3.5 h-3.5 text-emerald-600" />
          <span>Historia KIR-6: Registrar usuarios del sistema (RF-01)</span>
        </div>
        <h2 class="text-lg font-bold text-stone-900">Registrar Nuevo Usuario y Asignarle Rol</h2>
        <p class="text-xs text-stone-500 mt-0.5">
          Crea la cuenta en Supabase (`auth.users` y `public.usuarios`) y le asigna su rol activo de forma simultánea.
        </p>
      </div>

      <form @submit.prevent="registerUser" class="grid gap-4 sm:grid-cols-3 items-end">
        <div>
          <label class="block text-xs font-semibold text-stone-700 mb-1">Nombre completo *</label>
          <input
            v-model="newUserName"
            required
            minlength="2"
            maxlength="100"
            placeholder="ej. Dra. Claudia Morales"
            class="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-stone-700 mb-1">Correo electrónico *</label>
          <input
            v-model="newUserEmail"
            required
            type="email"
            placeholder="claudia@kiriku.org"
            class="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-stone-700 mb-1">Rol a asignar *</label>
          <select
            v-model="newUserRole"
            required
            class="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none bg-white cursor-pointer"
          >
            <option :value="null" disabled>Selecciona un rol</option>
            <option v-for="r in roles.filter((entry) => entry.active)" :key="r.id" :value="r.id">
              {{ r.name }}
            </option>
          </select>
        </div>

        <div class="sm:col-span-3 flex justify-end pt-2">
          <button
            type="submit"
            :disabled="busy || newUserRole === null || !newUserName.trim() || !newUserEmail.trim()"
            class="px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <UserPlus class="w-4 h-4" />
            <span>{{ busy ? 'Registrando…' : 'Registrar Usuario y Asignar Rol' }}</span>
          </button>
        </div>
      </form>
    </section>

    <!-- 3. ASIGNAR / CAMBIAR ROL DE CUENTAS EXISTENTES -->
    <section class="rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 space-y-4 shadow-xs">
      <div class="pb-3 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-stone-900">Cuentas Registradas en la BD y sus Roles</h2>
          <p class="text-xs text-stone-500 mt-0.5">
            Busca una cuenta existente y cámbiale su rol de inmediato en Supabase.
          </p>
        </div>

        <form @submit.prevent="load" class="flex items-center gap-2">
          <input
            v-model="queryText"
            type="search"
            placeholder="Buscar por correo..."
            class="rounded-xl border border-stone-300 px-3 py-1.5 text-xs focus:border-[#289EAB] focus:outline-none"
          />
          <button class="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold cursor-pointer">
            Buscar
          </button>
        </form>
      </div>

      <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end p-4 bg-stone-50 rounded-2xl border border-stone-200">
        <div>
          <label class="block text-xs font-semibold text-stone-700 mb-1">Seleccionar cuenta</label>
          <select
            v-model="selectedUser"
            class="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none bg-white cursor-pointer"
          >
            <option value="">Selecciona un usuario...</option>
            <option v-for="user in users" :key="user.id" :value="user.id">
              {{ user.email }}
            </option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-stone-700 mb-1">Nuevo rol</label>
          <select
            v-model="selectedRole"
            class="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-[#289EAB] focus:outline-none bg-white cursor-pointer"
          >
            <option :value="null">Selecciona un rol...</option>
            <option v-for="r in roles.filter((entry) => entry.active)" :key="r.id" :value="r.id">
              {{ r.name }}
            </option>
          </select>
        </div>

        <div>
          <button
            @click="assign"
            :disabled="!selectedUser || selectedRole === null || busy"
            class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#289EAB] hover:bg-[#1E7B85] text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            Cambiar Rol
          </button>
        </div>
      </div>

      <!-- Tabla de usuarios y sus roles asignados -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b border-stone-200 text-stone-400 uppercase tracking-wider font-semibold">
              <th class="py-2.5 px-3">Correo Electrónico</th>
              <th class="py-2.5 px-3">Roles Asignados</th>
              <th class="py-2.5 px-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            <tr v-for="user in users" :key="user.id" class="hover:bg-stone-50/80 transition-colors">
              <td class="py-3 px-3 font-semibold text-stone-900 font-mono">{{ user.email }}</td>
              <td class="py-3 px-3">
                <span
                  v-for="r in user.roles"
                  :key="r.id"
                  class="inline-block px-2.5 py-0.5 rounded-full bg-[#E8F6F8] text-[#1E7B85] font-bold text-[11px] mr-1.5"
                >
                  {{ r.name }}
                </span>
                <span v-if="!user.roles.length" class="text-stone-400 italic">Sin rol</span>
              </td>
              <td class="py-3 px-3 text-right">
                <button
                  @click="selectedUser = user.id"
                  class="text-xs text-[#1E7B85] hover:underline font-semibold cursor-pointer"
                >
                  Seleccionar para cambiar rol
                </button>
              </td>
            </tr>
            <tr v-if="!users.length">
              <td colspan="3" class="py-6 text-center text-stone-400">
                No hay usuarios cargados.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
