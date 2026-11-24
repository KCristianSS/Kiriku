<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api/client';
import type { DonationNeedRequestPayload, DonationNeedRequestResponse, Proyecto } from '../types';
import { AlertCircle, CheckCircle2, Heart, Send, Sparkles } from 'lucide-vue-next';

const projects = ref<Proyecto[]>([]);
const loadingProjects = ref(false);
const submitting = ref(false);
const error = ref('');
const result = ref<DonationNeedRequestResponse | null>(null);

const form = reactive<DonationNeedRequestPayload>({
  receptor_nombre: '',
  receptor_email: '',
  receptor_telefono: '',
  receptor_organizacion: '',
  tipo_necesidad: 'especie',
  titulo: '',
  descripcion: '',
  monto_objetivo: null,
  cantidad_objetivo: null,
  unidad_medida: '',
  fecha_necesaria: '',
  proyecto_destino_id: null,
});

const isCashNeed = computed(() => form.tipo_necesidad === 'economica');

onMounted(async () => {
  loadingProjects.value = true;
  try {
    projects.value = await api.getProyectos({ estado: 'aprobado' });
  } catch {
    // El proyecto destino es opcional; el formulario puede usarse si el catálogo no está disponible.
  } finally {
    loadingProjects.value = false;
  }
});

function resetForm() {
  form.receptor_nombre = '';
  form.receptor_email = '';
  form.receptor_telefono = '';
  form.receptor_organizacion = '';
  form.tipo_necesidad = 'especie';
  form.titulo = '';
  form.descripcion = '';
  form.monto_objetivo = null;
  form.cantidad_objetivo = null;
  form.unidad_medida = '';
  form.fecha_necesaria = '';
  form.proyecto_destino_id = null;
}

async function submitRequest() {
  if (submitting.value) return;
  submitting.value = true;
  error.value = '';
  result.value = null;

  const payload: DonationNeedRequestPayload = {
    ...form,
    receptor_nombre: form.receptor_nombre.trim(),
    receptor_email: form.receptor_email.trim(),
    receptor_telefono: form.receptor_telefono.trim(),
    receptor_organizacion: form.receptor_organizacion?.trim() || undefined,
    titulo: form.titulo.trim(),
    descripcion: form.descripcion.trim(),
    monto_objetivo: isCashNeed.value ? Number(form.monto_objetivo) : null,
    cantidad_objetivo: !isCashNeed.value && form.cantidad_objetivo ? Number(form.cantidad_objetivo) : null,
    unidad_medida: !isCashNeed.value ? form.unidad_medida?.trim() || undefined : undefined,
    fecha_necesaria: form.fecha_necesaria || undefined,
    proyecto_destino_id: form.proyecto_destino_id || null,
  };

  try {
    result.value = await api.createDonationNeedRequest(payload);
    resetForm();
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudo registrar la solicitud. Intenta nuevamente.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-6">
    <section class="relative bg-white border border-[#EB455F]/30 rounded-3xl p-6 sm:p-9 shadow-sm overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#EB455F] via-[#F58F38] to-[#289EAB]"></div>
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 bg-[#FDECEF] text-[#EB455F] rounded-2xl flex items-center justify-center shrink-0"><Heart class="w-6 h-6" /></div>
        <div>
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDECEF] text-[#C9334B] text-xs font-semibold mb-2"><Sparkles class="w-3.5 h-3.5 text-[#F58F38]" /><span>Solidaridad & Apoyo</span></div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900">Registrar una necesidad de donación</h1>
          <p class="text-stone-600 text-sm mt-2 max-w-2xl">Organizaciones y comunidades pueden registrar qué apoyo necesitan y quién recibirá la donación. El equipo Kirikú revisará la solicitud.</p>
        </div>
      </div>
    </section>

    <div v-if="result" role="status" class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
      <CheckCircle2 class="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
      <div><p class="font-semibold">Solicitud registrada correctamente.</p><p class="text-sm mt-1">Código: <strong>#{{ result.id }}</strong> · Estado: {{ result.estado }}. Guardamos el contacto del receptor para dar seguimiento.</p></div>
    </div>
    <div v-if="error" role="alert" class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3"><AlertCircle class="w-5 h-5 shrink-0" />{{ error }}</div>

    <form @submit.prevent="submitRequest" class="bg-white rounded-3xl border border-stone-200 shadow-xs divide-y divide-stone-100">
      <section class="p-5 sm:p-7 space-y-4">
        <div><h2 class="font-bold text-stone-900">Datos del receptor</h2><p class="text-xs text-stone-500 mt-1">Persona u organización responsable de recibir el apoyo.</p></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="text-xs font-semibold text-stone-700">Nombre de contacto *<input v-model="form.receptor_nombre" required maxlength="160" autocomplete="name" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Nombre y apellido" /></label>
          <label class="text-xs font-semibold text-stone-700">Organización o comunidad<input v-model="form.receptor_organizacion" maxlength="180" autocomplete="organization" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Nombre de la organización" /></label>
          <label class="text-xs font-semibold text-stone-700">Correo electrónico *<input v-model="form.receptor_email" required type="email" maxlength="254" autocomplete="email" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="contacto@organizacion.org" /></label>
          <label class="text-xs font-semibold text-stone-700">Teléfono *<input v-model="form.receptor_telefono" required type="tel" maxlength="40" autocomplete="tel" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="+591 ..." /></label>
        </div>
      </section>

      <section class="p-5 sm:p-7 space-y-4">
        <div><h2 class="font-bold text-stone-900">Detalle de la necesidad</h2><p class="text-xs text-stone-500 mt-1">Indica el tipo y describe con claridad el apoyo requerido.</p></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="text-xs font-semibold text-stone-700">Tipo de necesidad *<select v-model="form.tipo_necesidad" required class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]"><option value="especie">Donación en especie</option><option value="economica">Apoyo económico</option></select></label>
          <label class="text-xs font-semibold text-stone-700">Proyecto relacionado (opcional)<select v-model="form.proyecto_destino_id" :disabled="loadingProjects" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]"><option :value="null">Necesidad general</option><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.titulo }}</option></select></label>
          <label class="text-xs font-semibold text-stone-700 sm:col-span-2">Título de la necesidad *<input v-model="form.titulo" required maxlength="180" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Ej. Material escolar para el centro comunitario" /></label>
          <label class="text-xs font-semibold text-stone-700 sm:col-span-2">Descripción *<textarea v-model="form.descripcion" required maxlength="3000" minlength="10" rows="4" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Describe para quién es, por qué se necesita y cómo se utilizará el apoyo..."></textarea><span class="text-[11px] text-stone-400 font-normal">{{ form.descripcion.length }}/3000 caracteres</span></label>
          <label v-if="isCashNeed" class="text-xs font-semibold text-stone-700">Monto objetivo (Bs.) *<input v-model.number="form.monto_objetivo" required type="number" min="0.01" step="0.01" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="0.00" /></label>
          <template v-else>
            <label class="text-xs font-semibold text-stone-700">Cantidad requerida (opcional)<input v-model.number="form.cantidad_objetivo" type="number" min="0.01" step="0.01" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Ej. 30" /></label>
            <label class="text-xs font-semibold text-stone-700">Unidad de medida<input v-model="form.unidad_medida" maxlength="60" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Unidades, cajas, kits..." /></label>
          </template>
          <label class="text-xs font-semibold text-stone-700">Fecha en que se necesita (opcional)<input v-model="form.fecha_necesaria" type="date" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" /></label>
        </div>
      </section>

      <footer class="p-5 sm:px-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p class="text-xs text-stone-500">Los campos con * son obligatorios. El envío queda pendiente de revisión.</p>
        <button type="submit" :disabled="submitting" class="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#EB455F] hover:bg-[#C9334B] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"><Send class="w-4 h-4" />{{ submitting ? 'Enviando solicitud...' : 'Registrar necesidad' }}</button>
      </footer>
    </form>
  </main>
</template>
