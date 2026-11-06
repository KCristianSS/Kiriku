<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Search, Users, Pencil, RotateCcw, RefreshCw, X, Save } from 'lucide-vue-next';
import { useApplicationsStore } from '../../stores/applications';
import { api } from '../../api/client';
import type { Postulante, Proyecto } from '../../types';

const store = useApplicationsStore();
const projects = ref<Proyecto[]>([]);
const search = ref('');
const view = ref<'postulantes' | 'postulaciones'>('postulantes');
const selectedApplicant = ref<Postulante | null>(null);
const editing = ref(false);
const busyId = ref<string | number | null>(null);
const notice = ref('');
const problem = ref('');
const editForm = ref<Partial<Postulante>>({});
const targetProject = ref<Record<string, string>>({});

const filteredApplicants = computed(() => store.applicantsPool);
const filteredApplications = computed(() => store.applications);

async function load() {
  await Promise.all([
    store.fetchApplicantsPool({ q: search.value }),
    store.fetchAdminApplications({ q: search.value }),
  ]);
}

async function searchRecords() {
  await load();
}

function openEditor(person: Postulante) {
  selectedApplicant.value = person;
  editForm.value = { ...person };
  editing.value = true;
  notice.value = '';
  problem.value = '';
}

async function saveApplicant() {
  if (!selectedApplicant.value) return;
  try {
    const updated = await api.updateApplicant(selectedApplicant.value.id, editForm.value);
    notice.value = 'Datos del voluntario actualizados.';
    editing.value = false;
    selectedApplicant.value = null;
    await load();
    selectedApplicant.value = updated;
  } catch (error: any) {
    problem.value = error?.response?.data?.error || 'No se pudieron guardar los datos.';
  }
}

async function reengage(applicationId: string | number) {
  try {
    busyId.value = applicationId;
    problem.value = '';
    const projectId = targetProject.value[String(applicationId)];
    await api.manageReenganche(applicationId, projectId ? { nuevo_proyecto_id: projectId } : { es_reenganche: true });
    notice.value = 'Reenganche registrado.';
    await load();
  } catch (error: any) {
    problem.value = error?.response?.data?.error || 'No se pudo registrar el reenganche.';
  } finally {
    busyId.value = null;
  }
}

async function restartTechnicalStage(applicationId: string | number) {
  try {
    busyId.value = applicationId;
    problem.value = '';
    await api.restartTechnicalStage(applicationId);
    notice.value = 'Etapa técnica reiniciada.';
    await load();
  } catch (error: any) {
    problem.value = error?.response?.data?.error || 'No se pudo reiniciar la etapa técnica.';
  } finally {
    busyId.value = null;
  }
}

onMounted(async () => {
  try {
    projects.value = (await api.getProyectos({ estado: 'aprobado' }));
  } catch {
    problem.value = 'No se pudieron cargar los proyectos aprobados.';
  }
  await load();
});
</script>

<template>
  <main class="max-w-6xl mx-auto px-4 py-10">
    <header class="mb-7">
      <div class="flex items-center gap-3 mb-2 text-[#289EAB]"><Users class="w-7 h-7" /><span class="text-sm font-semibold uppercase tracking-wide">Administración</span></div>
      <h1 class="text-3xl font-bold text-stone-900">Banco de postulantes</h1>
      <p class="text-stone-600 mt-2">Actualiza perfiles, administra reenganches y reinicia la evaluación técnica.</p>
    </header>

    <div v-if="notice" class="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800" role="status">{{ notice }}</div>
    <div v-if="problem || store.error" class="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800" role="alert">{{ problem || store.error }}</div>

    <section class="bg-white border border-stone-200 rounded-xl shadow-sm">
      <div class="p-4 border-b border-stone-200 flex flex-col sm:flex-row gap-3 justify-between">
        <div class="inline-flex rounded-lg bg-stone-100 p-1">
          <button class="px-4 py-2 rounded-md text-sm font-medium" :class="view === 'postulantes' ? 'bg-white shadow text-stone-900' : 'text-stone-600'" @click="view = 'postulantes'">Voluntarios</button>
          <button class="px-4 py-2 rounded-md text-sm font-medium" :class="view === 'postulaciones' ? 'bg-white shadow text-stone-900' : 'text-stone-600'" @click="view = 'postulaciones'">Postulaciones</button>
        </div>
        <form class="flex gap-2" @submit.prevent="searchRecords">
          <label class="sr-only" for="search">Buscar voluntarios</label>
          <div class="flex items-center gap-2 border border-stone-300 rounded-lg px-3"><Search class="w-4 h-4 text-stone-400" /><input id="search" v-model="search" class="py-2 outline-none text-sm" placeholder="Nombre, CI o habilidades" /></div>
          <button class="px-4 py-2 rounded-lg bg-[#289EAB] text-white text-sm font-semibold">Buscar</button>
        </form>
      </div>

      <div v-if="view === 'postulantes'" class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-stone-50 text-stone-600"><tr><th class="p-3">Voluntario</th><th class="p-3">Contacto</th><th class="p-3">Perfil</th><th class="p-3">Postulaciones</th><th class="p-3"></th></tr></thead>
          <tbody>
            <tr v-for="person in filteredApplicants" :key="person.id" class="border-t border-stone-100">
              <td class="p-3"><div class="font-semibold text-stone-900">{{ person.nombres }} {{ person.apellidos }}</div><div class="text-xs text-stone-500">CI: {{ person.ci }}</div></td>
              <td class="p-3"><div>{{ person.email }}</div><div class="text-xs text-stone-500">{{ person.telefono || 'Sin teléfono' }}</div></td>
              <td class="p-3"><div>{{ person.profesion_ocupacion || 'Sin profesión registrada' }}</div><div class="text-xs text-stone-500 max-w-xs truncate">{{ person.habilidades || 'Sin habilidades registradas' }}</div></td>
              <td class="p-3">{{ person.total_postulaciones }}</td>
              <td class="p-3 text-right"><button class="inline-flex items-center gap-2 text-[#1E7B85] font-semibold hover:underline" @click="openEditor(person)"><Pencil class="w-4 h-4" />Editar datos</button></td>
            </tr>
            <tr v-if="!store.loading && !filteredApplicants.length"><td colspan="5" class="p-8 text-center text-stone-500">No se encontraron voluntarios.</td></tr>
          </tbody>
        </table>
      </div>

      <div v-else class="divide-y divide-stone-100">
        <article v-for="application in filteredApplications" :key="application.id" class="p-4 flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
          <div>
            <div class="font-semibold text-stone-900">{{ application.postulante?.nombres }} {{ application.postulante?.apellidos }}</div>
            <div class="text-sm text-stone-600">{{ application.proyecto?.titulo }} · {{ application.estado_general }}</div>
            <div class="text-xs text-stone-500">Etapa técnica: {{ application.etapas?.find((stage) => stage.etapa === 'tecnica')?.estado || 'Sin iniciar' }}</div>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <label class="sr-only" :for="`project-${application.id}`">Proyecto de destino</label>
            <select :id="`project-${application.id}`" v-model="targetProject[String(application.id)]" class="border border-stone-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Mismo proyecto</option>
              <option v-for="project in projects" :key="project.id" :value="String(project.id)">{{ project.titulo }}</option>
            </select>
            <button class="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 bg-amber-50 text-amber-800 text-sm font-semibold disabled:opacity-50" :disabled="busyId === application.id" @click="reengage(application.id)"><RotateCcw class="w-4 h-4" />Reenganchar</button>
            <button class="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 bg-stone-100 text-stone-700 text-sm font-semibold disabled:opacity-50" :disabled="busyId === application.id" @click="restartTechnicalStage(application.id)"><RefreshCw class="w-4 h-4" />Reiniciar técnica</button>
          </div>
        </article>
        <div v-if="!store.loading && !filteredApplications.length" class="p-8 text-center text-stone-500">No se encontraron postulaciones.</div>
      </div>
      <div v-if="store.loading" class="p-4 text-center text-stone-500 text-sm">Cargando información…</div>
    </section>

    <div v-if="editing && selectedApplicant" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="editing = false">
      <section class="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-6" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div class="flex justify-between items-center mb-5"><h2 id="edit-title" class="text-xl font-bold">Actualizar datos del voluntario</h2><button aria-label="Cerrar" @click="editing = false"><X class="w-5 h-5" /></button></div>
        <form class="grid sm:grid-cols-2 gap-4" @submit.prevent="saveApplicant">
          <label class="text-sm font-medium">Nombres<input v-model="editForm.nombres" required class="mt-1 w-full border rounded-lg p-2" /></label>
          <label class="text-sm font-medium">Apellidos<input v-model="editForm.apellidos" required class="mt-1 w-full border rounded-lg p-2" /></label>
          <label class="text-sm font-medium">Correo<input v-model="editForm.email" type="email" required class="mt-1 w-full border rounded-lg p-2" /></label>
          <label class="text-sm font-medium">Teléfono<input v-model="editForm.telefono" class="mt-1 w-full border rounded-lg p-2" /></label>
          <label class="text-sm font-medium">CI<input v-model="editForm.ci" required class="mt-1 w-full border rounded-lg p-2" /></label>
          <label class="text-sm font-medium">Fecha de nacimiento<input v-model="editForm.fecha_nacimiento" type="date" required class="mt-1 w-full border rounded-lg p-2" /></label>
          <label class="text-sm font-medium">Profesión u ocupación<input v-model="editForm.profesion_ocupacion" class="mt-1 w-full border rounded-lg p-2" /></label>
          <label class="text-sm font-medium">Habilidades<input v-model="editForm.habilidades" class="mt-1 w-full border rounded-lg p-2" /></label>
          <label class="text-sm font-medium sm:col-span-2">Motivación<textarea v-model="editForm.motivacion" rows="3" class="mt-1 w-full border rounded-lg p-2" /></label>
          <div class="sm:col-span-2 flex justify-end gap-2 pt-2"><button type="button" class="px-4 py-2 rounded-lg border" @click="editing = false">Cancelar</button><button class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#289EAB] text-white font-semibold"><Save class="w-4 h-4" />Guardar cambios</button></div>
        </form>
      </section>
    </div>
  </main>
</template>
