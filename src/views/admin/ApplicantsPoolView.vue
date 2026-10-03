<script setup lang="ts">
import { Users } from 'lucide-vue-next';
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-16">
    <div class="border border-stone-200 rounded-2xl p-10 text-center bg-white shadow-xs">
      <div class="w-12 h-12 bg-[#E8F6F8] text-[#289EAB] rounded-xl flex items-center justify-center mx-auto mb-4">
        <Users class="w-6 h-6" />
      </div>
      <h1 class="text-2xl font-bold text-stone-900 mb-2">
        Banco de Postulantes & Evaluación
      </h1>
      <p class="text-stone-600 text-sm max-w-md mx-auto mb-6">
        Vista destinada a la gestión del banco de voluntarios, proceso de evaluación y asignación a proyectos.
      </p>

      <div class="inline-flex items-center text-xs text-stone-400 font-mono bg-stone-100 px-3 py-1.5 rounded-lg">
        src/views/admin/ApplicantsPoolView.vue
      </div>
    </div>
  </div>
</template>
