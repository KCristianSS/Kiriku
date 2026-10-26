<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, apiClient } from '../api/client';
import { ShieldCheck, LogIn, AlertCircle, Info } from 'lucide-vue-next';

const email = ref('admin@kiriku.org');
const password = ref('Admin123!');
const error = ref('');
const busy = ref(false);
const demoUsers = ref<Array<{ id: string; nombre: string; email: string; rol: string }>>([]);
const router = useRouter();
const route = useRoute();

async function loadDemoUsers() {
  try {
    const res = await apiClient.get('/auth/demo-users');
    demoUsers.value = res.data;
  } catch (e) {
    console.error('Error loading users from DB:', e);
  }
}

onMounted(loadDemoUsers);

async function login() {
  if (!email.value.trim() || !password.value) {
    error.value = 'Ingresa tu correo y contraseña.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const res = await api.login({
      email: email.value.trim(),
      password: password.value,
    });
    localStorage.setItem('kiriku_admin_token', res.token || 'dev-admin-token');
    localStorage.setItem('kiriku_user_email', res.user?.email || email.value);
    router.replace(String(route.query.redirect || '/admin'));
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Correo o contraseña incorrectos.';
  } finally {
    busy.value = false;
  }
}

function fillCredentials(fillEmail: string, fillPass: string) {
  email.value = fillEmail;
  password.value = fillPass;
  error.value = '';
}
</script>

<template>
  <div class="max-w-md mx-auto px-4 py-16">
    <div class="bg-white rounded-3xl border border-stone-200 p-8 shadow-sm space-y-6">
      <div class="text-center">
        <div class="w-12 h-12 bg-[#E8F6F8] text-[#1E7B85] rounded-2xl flex items-center justify-center mx-auto mb-3">
          <ShieldCheck class="w-6 h-6" />
        </div>
        <p class="text-xs font-bold uppercase tracking-wider text-[#1E7B85]">Kirikú Voluntariado</p>
        <h1 class="text-2xl font-extrabold text-stone-900 mt-1">Iniciar sesión</h1>
        <p class="text-xs text-stone-500 mt-1">Acceso administrativo para revisión, roles y reportes</p>
      </div>

      <form @submit.prevent="login" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-stone-700 mb-1">Correo electrónico</label>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            required
            placeholder="admin@kiriku.org"
            class="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-[#289EAB] focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-stone-700 mb-1">Contraseña</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            placeholder="••••••••"
            class="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-[#289EAB] focus:outline-none"
          />
        </div>

        <p v-if="error" role="alert" class="text-xs font-semibold text-red-700 bg-red-50 p-3 rounded-xl border border-red-200 flex items-center gap-2">
          <AlertCircle class="w-4 h-4 text-red-600 shrink-0" />
          <span>{{ error }}</span>
        </p>

        <button
          type="submit"
          :disabled="busy"
          class="w-full rounded-xl bg-[#289EAB] hover:bg-[#1E7B85] px-4 py-2.5 text-sm font-bold text-white transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <LogIn class="w-4 h-4" />
          <span>{{ busy ? 'Validando credenciales…' : 'Ingresar al panel' }}</span>
        </button>
      </form>

      <!-- Cuentas reales cargadas directamente de la BD -->
      <div v-if="demoUsers.length" class="pt-4 border-t border-stone-100 space-y-2">
        <div class="flex items-center gap-1.5 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
          <Info class="w-3.5 h-3.5 text-[#289EAB]" />
          <span>Cuentas activas en la BD (Clic para autocompletar):</span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs">
          <button
            v-for="u in demoUsers"
            :key="u.email"
            type="button"
            @click="fillCredentials(u.email, 'Admin123!')"
            class="p-2.5 rounded-xl bg-stone-50 hover:bg-[#E8F6F8] hover:text-[#1E7B85] border border-stone-200 text-left cursor-pointer transition-all"
          >
            <span class="font-bold block truncate text-stone-900">{{ u.email }}</span>
            <span class="text-[10px] text-stone-500 block truncate">{{ u.nombre }} ({{ u.rol }})</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
