<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { supabaseAuth, getAuthSetupError } from '../auth';

const email = ref('');
const password = ref('');
const error = ref(getAuthSetupError());
const busy = ref(false);
const router = useRouter();
const route = useRoute();

async function login() {
  if (!supabaseAuth) return;
  busy.value = true;
  error.value = '';
  const { error: authError } = await supabaseAuth.auth.signInWithPassword({ email: email.value, password: password.value });
  busy.value = false;
  if (authError) { error.value = 'Correo o contraseña incorrectos.'; return; }
  router.replace(String(route.query.redirect || '/admin'));
}
</script>

<template>
  <div class="max-w-md mx-auto px-4 py-16">
    <form @submit.prevent="login" class="bg-white rounded-2xl border border-stone-200 p-8 shadow-sm space-y-5">
      <div><p class="text-sm font-semibold text-[#1E7B85]">Panel interno</p><h1 class="text-2xl font-bold mt-1">Iniciar sesión</h1></div>
      <label class="block text-sm font-medium">Correo electrónico<input v-model="email" type="email" autocomplete="username" required class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
      <label class="block text-sm font-medium">Contraseña<input v-model="password" type="password" autocomplete="current-password" required class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
      <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>
      <button :disabled="busy || !supabaseAuth" class="w-full rounded-lg bg-[#289EAB] px-4 py-2.5 font-semibold text-white disabled:opacity-50">{{ busy ? 'Ingresando…' : 'Ingresar' }}</button>
    </form>
  </div>
</template>
