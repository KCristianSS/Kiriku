<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../api/client';

type Permission = { id: number; code: string; name: string; description?: string };
type Role = { id: number; code: string; name: string; description: string; active: boolean; permissions: Permission[] };
type RoleUser = { id: string; email: string; roles: Array<{ id: number; name: string }> };

const roles = ref<Role[]>([]);
const permissions = ref<Permission[]>([]);
const users = ref<RoleUser[]>([]);
const queryText = ref('');
const selectedUser = ref('');
const selectedRole = ref<number | null>(null);
const editingId = ref<number | null>(null);
const code = ref('');
const name = ref('');
const description = ref('');
const selectedPermissions = ref<string[]>([]);
const error = ref('');
const notice = ref('');
const busy = ref(false);

async function load() {
  busy.value = true;
  error.value = '';
  try {
    [roles.value, permissions.value, users.value] = await Promise.all([
      api.getRoles(), api.getRolePermissions(), api.getRoleUsers(queryText.value),
    ]);
  } catch (e: any) {
    error.value = e.response?.data?.error || 'No se pudo cargar la gestión de roles.';
  } finally { busy.value = false; }
}

function edit(role: Role) {
  editingId.value = role.id;
  code.value = role.code;
  name.value = role.name;
  description.value = role.description;
  selectedPermissions.value = role.permissions.map((permission) => permission.code);
}

function reset() {
  editingId.value = null; code.value = ''; name.value = ''; description.value = ''; selectedPermissions.value = [];
}

async function saveRole() {
  error.value = ''; notice.value = '';
  try {
    if (editingId.value) {
      const role = roles.value.find((entry) => entry.id === editingId.value)!;
      await api.updateRole(editingId.value, { name: name.value, description: description.value, active: role.active, permission_codes: selectedPermissions.value });
    } else {
      await api.createRole({ code: code.value, name: name.value, description: description.value, permission_codes: selectedPermissions.value });
    }
    notice.value = 'Rol guardado.'; reset(); await load();
  } catch (e: any) { error.value = e.response?.data?.error || 'No se pudo guardar el rol.'; }
}

async function assign() {
  if (!selectedUser.value || selectedRole.value === null) return;
  error.value = ''; notice.value = '';
  try { await api.assignRole(selectedUser.value, selectedRole.value); notice.value = 'Rol asignado.'; await load(); }
  catch (e: any) { error.value = e.response?.data?.error || 'No se pudo asignar el rol.'; }
}

onMounted(load);
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-10 space-y-8">
    <header><p class="text-sm font-semibold text-[#1E7B85]">Administración</p><h1 class="text-3xl font-bold text-stone-900">Roles y permisos</h1><p class="mt-2 text-sm text-stone-600">Define el acceso a las funciones administrativas y asigna un rol a cada cuenta de Supabase Auth.</p></header>
    <p v-if="error" role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
    <p v-if="notice" role="status" class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ notice }}</p>

    <section class="grid gap-6 lg:grid-cols-2">
      <form @submit.prevent="saveRole" class="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
        <div class="flex justify-between gap-3"><h2 class="text-xl font-semibold">{{ editingId ? 'Editar rol' : 'Crear rol' }}</h2><button v-if="editingId" type="button" @click="reset" class="text-sm text-stone-600 underline">Cancelar</button></div>
        <label v-if="!editingId" class="block text-sm font-medium">Código<input v-model="code" required pattern="[a-z][a-z0-9_]{2,49}" placeholder="coordinador" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
        <label class="block text-sm font-medium">Nombre<input v-model="name" required class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
        <label class="block text-sm font-medium">Descripción<textarea v-model="description" rows="2" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
        <fieldset class="space-y-2"><legend class="text-sm font-medium">Permisos</legend><label v-for="permission in permissions" :key="permission.code" class="flex items-start gap-2 text-sm"><input v-model="selectedPermissions" type="checkbox" :value="permission.code" class="mt-1 accent-[#289EAB]" /><span><b>{{ permission.name }}</b><small class="block text-stone-500">{{ permission.description }}</small></span></label></fieldset>
        <button :disabled="busy" class="rounded-lg bg-[#289EAB] px-4 py-2 font-semibold text-white disabled:opacity-50">Guardar rol</button>
      </form>

      <section class="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 class="text-xl font-semibold">Roles configurados</h2>
        <p v-if="!roles.length" class="mt-4 text-sm text-stone-500">{{ busy ? 'Cargando…' : 'No hay roles configurados.' }}</p>
        <article v-for="role in roles" :key="role.id" class="mt-4 rounded-xl border border-stone-200 p-4">
          <div class="flex items-start justify-between gap-4"><div><h3 class="font-semibold">{{ role.name }} <span class="font-normal text-xs text-stone-500">({{ role.code }})</span></h3><p class="mt-1 text-sm text-stone-600">{{ role.description }}</p></div><button @click="edit(role)" class="text-sm font-semibold text-[#1E7B85]">Editar</button></div>
          <div class="mt-3 flex flex-wrap gap-1.5"><span v-for="permission in role.permissions" :key="permission.code" class="rounded-full bg-[#E8F6F8] px-2.5 py-1 text-xs text-[#1E7B85]">{{ permission.name }}</span><span v-if="!role.permissions.length" class="text-xs text-stone-500">Sin permisos</span></div>
        </article>
      </section>
    </section>

    <section class="rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
      <div><h2 class="text-xl font-semibold">Asignar rol a una cuenta</h2><p class="mt-1 text-sm text-stone-600">Busca una cuenta existente por correo. Las cuentas nuevas se crean desde Supabase Auth.</p></div>
      <form @submit.prevent="load" class="flex flex-wrap gap-2"><input v-model="queryText" type="search" placeholder="Buscar por correo" class="min-w-56 flex-1 rounded-lg border border-stone-300 px-3 py-2" /><button class="rounded-lg border border-stone-300 px-4 py-2">Buscar</button></form>
      <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><select v-model="selectedUser" class="rounded-lg border border-stone-300 px-3 py-2"><option value="">Selecciona una cuenta</option><option v-for="user in users" :key="user.id" :value="user.id">{{ user.email }}</option></select><select v-model.number="selectedRole" class="rounded-lg border border-stone-300 px-3 py-2"><option :value="null">Selecciona un rol</option><option v-for="role in roles.filter((entry) => entry.active)" :key="role.id" :value="role.id">{{ role.name }}</option></select><button @click="assign" :disabled="!selectedUser || selectedRole === null" class="rounded-lg bg-stone-800 px-4 py-2 font-semibold text-white disabled:opacity-50">Asignar</button></div>
      <div class="divide-y divide-stone-100"><div v-for="user in users" :key="user.id" class="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{{ user.email }}</span><span class="text-stone-500">{{ user.roles.map((role) => role.name).join(', ') || 'Sin rol' }}</span></div></div>
    </section>
  </div>
</template>
