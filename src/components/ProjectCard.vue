<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { MapPin, Users, Calendar, ShieldAlert, ArrowRight, Building2, Image as ImageIcon } from 'lucide-vue-next';
import type { Proyecto } from '../types';

interface Props {
  project: Proyecto;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'apply', project: Proyecto): void;
}>();

const router = useRouter();

function handleApplyClick() {
  emit('apply', props.project);
}
</script>

<template>
  <div class="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col h-full group">
    <!-- Image slot from DB URL or clean placeholder -->
    <div class="relative h-48 w-full bg-stone-100 overflow-hidden flex items-center justify-center">
      <img
        v-if="project.portada_url"
        :src="project.portada_url"
        :alt="project.titulo"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
      <div v-else class="text-stone-300 flex flex-col items-center justify-center gap-1">
        <ImageIcon class="w-8 h-8" />
      </div>

      <!-- +18 indicator tag -->
      <div v-if="project.es_mayor_edad" class="absolute top-3 right-3 bg-amber-500/90 backdrop-blur-xs text-white text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 shadow-sm">
        <ShieldAlert class="w-3.5 h-3.5" />
        <span>+18 Años</span>
      </div>
    </div>

    <!-- Body -->
    <div class="p-5 flex-1 flex flex-col justify-between">
      <div>
        <!-- Organization and location clean metadata -->
        <div class="flex items-center gap-2 text-xs text-stone-500 mb-2">
          <span class="flex items-center gap-1 font-medium text-emerald-800">
            <Building2 class="w-3.5 h-3.5" />
            {{ project.organizacion?.nombre || 'Iniciativa Kirikú' }}
          </span>
          <span aria-hidden="true">·</span>
          <span class="flex items-center gap-1 text-stone-600">
            <MapPin class="w-3.5 h-3.5 text-stone-400" />
            {{ project.ubicacion }}
          </span>
        </div>

        <h3 class="text-lg font-bold text-stone-900 group-hover:text-emerald-800 transition-colors leading-snug mb-2">
          {{ project.titulo }}
        </h3>

        <p class="text-sm text-stone-600 line-clamp-3 mb-4 leading-relaxed">
          {{ project.descripcion }}
        </p>
      </div>

      <div>
        <!-- Specs row with tabular numbers -->
        <div class="pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600 mb-4">
          <div class="flex items-center gap-1.5">
            <Users class="w-4 h-4 text-emerald-700" />
            <span>Cupos: <strong class="font-mono tabular-nums text-stone-900">{{ project.cupos_disponibles }}</strong></span>
          </div>

          <div v-if="project.fecha_inicio" class="flex items-center gap-1 text-stone-500 font-mono tabular-nums">
            <Calendar class="w-3.5 h-3.5" />
            <span>{{ new Date(project.fecha_inicio).toLocaleDateString('es-BO', { month: 'short', day: 'numeric' }) }}</span>
          </div>
        </div>

        <!-- Action button -->
        <button
          @click="handleApplyClick"
          class="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-98"
        >
          <span>Postularme a este Proyecto</span>
          <ArrowRight class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
