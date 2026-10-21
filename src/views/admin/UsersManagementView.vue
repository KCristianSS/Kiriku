<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUsersStore } from '../../stores/users';
import type { Usuario, CreateUsuarioPayload, UpdateUsuarioPayload } from '../../types';
import { UserPlus, Edit, Trash2, Search, Shield, Loader2 } from 'lucide-vue-next';

const usersStore = useUsersStore();

const users = ref<Usuario[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const showCreateModal = ref(false);
const showEditModal = ref(false);
const selectedUser = ref<Usuario | null>(null);

const filters = ref({
  rol: '',
  activo: '',
  q: '',
});

const newUser = ref<CreateUsuarioPayload>({
  nombre: '',
  email: '',
  password: '',
  rol: 'voluntario',
});

const editUser = ref<UpdateUsuarioPayload>({});

onMounted(() => {
  loadUsers();
});

async function loadUsers() {
  loading.value = true;
  error.value = null;
  try {
    await usersStore.fetchUsers({
      rol: filters.value.rol || undefined,
      activo: filters.value.activo === '' ? undefined : filters.value.activo === 'true',
      q: filters.value.q || undefined,
    });
    users.value = usersStore.users;
  } catch (err: any) {
    error.value = err.message || 'Error al cargar usuarios';
  } finally {
    loading.value = false;
  }
}

async function handleCreateUser() {
  try {
    await usersStore.createUser(newUser.value);
    showCreateModal.value = false;
    newUser.value = { nombre: '', email: '', password: '', rol: 'voluntario' };
    await loadUsers();
  } catch (err: any) {
    error.value = err.message || 'Error al crear usuario';
  }
}

function openEditModal(user: Usuario) {
  selectedUser.value = user;
  editUser.value = {
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    activo: user.activo,
  };
  showEditModal.value = true;
}

async function handleUpdateUser() {
  if (!selectedUser.value) return;
  try {
    await usersStore.updateUser(selectedUser.value.id, editUser.value);
    showEditModal.value = false;
    selectedUser.value = null;
    editUser.value = {};
    await loadUsers();
  } catch (err: any) {
    error.value = err.message || 'Error al actualizar usuario';
  }
}

async function handleDeleteUser(id: string) {
  if (!confirm('¿Está seguro de eliminar este usuario?')) return;
  try {
    await usersStore.deleteUser(id);
    await loadUsers();
  } catch (err: any) {
    error.value = err.message || 'Error al eliminar usuario';
  }
}

async function toggleUserStatus(user: Usuario) {
  try {
    await usersStore.updateUser(user.id, { activo: !user.activo });
    await loadUsers();
  } catch (err: any) {
    error.value = err.message || 'Error al cambiar estado del usuario';
  }
}

function getRolBadge(rol: string) {
  const badges: Record<string, { color: string; label: string }> = {
    admin: { color: 'bg-red-100 text-red-700', label: 'Admin' },
    coordinador: { color: 'bg-blue-100 text-blue-700', label: 'Coordinador' },
    evaluador: { color: 'bg-green-100 text-green-700', label: 'Evaluador' },
    voluntario: { color: 'bg-gray-100 text-gray-700', label: 'Voluntario' },
  };
  return badges[rol] || { color: 'bg-gray-100 text-gray-700', label: rol };
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-[#E8F6F8] text-[#289EAB] rounded-xl flex items-center justify-center">
            <Shield class="w-5 h-5" />
          </div>
          <div>
            <h1 class="text-2xl font-bold text-stone-900">Gestión de Usuarios</h1>
            <p class="text-sm text-stone-600">Registrar y administrar usuarios del sistema</p>
          </div>
        </div>
        <button
          @click="showCreateModal = true"
          class="px-4 py-2 bg-[#289EAB] hover:bg-[#1E7B85] text-white rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2"
        >
          <UserPlus class="w-4 h-4" />
          <span>Nuevo Usuario</span>
        </button>
      </div>

      <div class="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p class="text-sm text-amber-800">
          <strong>Nota:</strong> Antes de usar esta funcionalidad, asegúrese de ejecutar el script SQL proporcionado en el README para crear la tabla <code>usuarios</code> en la base de datos.
        </p>
      </div>

      <div class="flex flex-wrap gap-3 mb-6">
        <div class="flex-1 min-w-[200px]">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              v-model="filters.q"
              @keyup.enter="loadUsers"
              type="text"
              placeholder="Buscar por nombre o email..."
              class="w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            />
          </div>
        </div>
        <select
          v-model="filters.rol"
          @change="loadUsers"
          class="px-4 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
        >
          <option value="">Todos los roles</option>
          <option value="admin">Admin</option>
          <option value="coordinador">Coordinador</option>
          <option value="evaluador">Evaluador</option>
          <option value="voluntario">Voluntario</option>
        </select>
        <select
          v-model="filters.activo"
          @change="loadUsers"
          class="px-4 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
        >
          <option value="">Todos los estados</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
        <button
          @click="loadUsers"
          class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm font-medium transition-all"
        >
          Filtrar
        </button>
      </div>

      <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        {{ error }}
      </div>

      <div v-if="loading" class="flex items-center justify-center py-12">
        <Loader2 class="w-8 h-8 text-[#289EAB] animate-spin" />
      </div>

      <div v-else-if="users.length === 0" class="text-center py-12 text-stone-500">
        <Shield class="w-12 h-12 mx-auto mb-3 text-stone-300" />
        <p>No hay usuarios registrados</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-stone-200">
              <th class="text-left py-3 px-4 text-sm font-semibold text-stone-700">Nombre</th>
              <th class="text-left py-3 px-4 text-sm font-semibold text-stone-700">Email</th>
              <th class="text-left py-3 px-4 text-sm font-semibold text-stone-700">Rol</th>
              <th class="text-left py-3 px-4 text-sm font-semibold text-stone-700">Estado</th>
              <th class="text-left py-3 px-4 text-sm font-semibold text-stone-700">Fecha Registro</th>
              <th class="text-right py-3 px-4 text-sm font-semibold text-stone-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-b border-stone-100 hover:bg-stone-50">
              <td class="py-3 px-4 text-sm text-stone-900 font-medium">{{ user.nombre }}</td>
              <td class="py-3 px-4 text-sm text-stone-600">{{ user.email }}</td>
              <td class="py-3 px-4">
                <span :class="['px-2 py-1 rounded-full text-xs font-medium', getRolBadge(user.rol).color]">
                  {{ getRolBadge(user.rol).label }}
                </span>
              </td>
              <td class="py-3 px-4">
                <button
                  @click="toggleUserStatus(user)"
                  :class="[
                    'px-2 py-1 rounded-full text-xs font-medium transition-all',
                    user.activo
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-red-100 text-red-700 hover:bg-red-200',
                  ]"
                >
                  {{ user.activo ? 'Activo' : 'Inactivo' }}
                </button>
              </td>
              <td class="py-3 px-4 text-sm text-stone-500">
                {{ user.created_at ? new Date(user.created_at).toLocaleDateString('es-BO') : '-' }}
              </td>
              <td class="py-3 px-4 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button
                    @click="openEditModal(user)"
                    class="p-1.5 text-stone-600 hover:text-[#289EAB] hover:bg-[#E8F6F8] rounded-lg transition-all"
                    title="Editar"
                  >
                    <Edit class="w-4 h-4" />
                  </button>
                  <button
                    @click="handleDeleteUser(user.id)"
                    class="p-1.5 text-stone-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    title="Eliminar"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="inline-flex items-center text-xs text-stone-400 font-mono bg-stone-100 px-3 py-1.5 rounded-lg mt-4">
      src/views/admin/UsersManagementView.vue
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="showCreateModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="showCreateModal = false"
    >
      <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 class="text-xl font-bold text-stone-900 mb-4">Registrar Nuevo Usuario</h2>
        <form @submit.prevent="handleCreateUser" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-stone-700 mb-1">Nombre *</label>
            <input
              v-model="newUser.nombre"
              type="text"
              required
              class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-stone-700 mb-1">Email *</label>
            <input
              v-model="newUser.email"
              type="email"
              required
              class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-stone-700 mb-1">Password *</label>
            <input
              v-model="newUser.password"
              type="password"
              required
              minlength="6"
              class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-stone-700 mb-1">Rol *</label>
            <select
              v-model="newUser.rol"
              required
              class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            >
              <option value="admin">Admin</option>
              <option value="coordinador">Coordinador</option>
              <option value="evaluador">Evaluador</option>
              <option value="voluntario">Voluntario</option>
            </select>
          </div>
          <div class="flex gap-3 pt-4">
            <button
              type="button"
              @click="showCreateModal = false"
              class="flex-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm font-medium transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="flex-1 px-4 py-2 bg-[#289EAB] hover:bg-[#1E7B85] text-white rounded-lg text-sm font-medium transition-all"
            >
              Registrar
            </button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="showEditModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="showEditModal = false"
    >
      <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 class="text-xl font-bold text-stone-900 mb-4">Editar Usuario</h2>
        <form @submit.prevent="handleUpdateUser" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-stone-700 mb-1">Nombre</label>
            <input
              v-model="editUser.nombre"
              type="text"
              class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-stone-700 mb-1">Email</label>
            <input
              v-model="editUser.email"
              type="email"
              class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-stone-700 mb-1">Password (dejar vacío para no cambiar)</label>
            <input
              v-model="editUser.password"
              type="password"
              minlength="6"
              class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-stone-700 mb-1">Rol</label>
            <select
              v-model="editUser.rol"
              class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            >
              <option value="admin">Admin</option>
              <option value="coordinador">Coordinador</option>
              <option value="evaluador">Evaluador</option>
              <option value="voluntario">Voluntario</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-stone-700 mb-1">Estado</label>
            <select
              v-model="editUser.activo"
              class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:border-transparent"
            >
              <option :value="true">Activo</option>
              <option :value="false">Inactivo</option>
            </select>
          </div>
          <div class="flex gap-3 pt-4">
            <button
              type="button"
              @click="showEditModal = false"
              class="flex-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm font-medium transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="flex-1 px-4 py-2 bg-[#289EAB] hover:bg-[#1E7B85] text-white rounded-lg text-sm font-medium transition-all"
            >
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
