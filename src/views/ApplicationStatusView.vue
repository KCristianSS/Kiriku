<script setup lang="ts">
import { Search, Sparkles } from 'lucide-vue-next';
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-16">
    <div class="relative bg-white border border-[#EB455F]/30 rounded-3xl p-10 text-center shadow-sm overflow-hidden">
      <!-- Top color banner accent -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#EB455F] via-[#F58F38] to-[#289EAB]"></div>

      <div class="w-14 h-14 bg-[#FDECEF] text-[#EB455F] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
        <Search class="w-7 h-7" />
      </div>

      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDECEF] text-[#C9334B] text-xs font-semibold mb-3">
        <Sparkles class="w-3.5 h-3.5 text-[#289EAB]" />
        <span>Consulta en Tiempo Real</span>
      </div>

      <h1 class="text-3xl font-extrabold text-stone-900 mb-2">
        Seguimiento de Postulación
      </h1>
      <p class="text-stone-600 text-sm max-w-md mx-auto mb-6 leading-relaxed">
        Vista destinada a que los postulantes consulten el estado de su proceso de evaluación.
      </p>

      <div class="inline-flex items-center text-xs text-stone-500 font-mono bg-stone-100 border border-stone-200 px-3.5 py-1.5 rounded-lg">
        src/views/ApplicationStatusView.vue
      </div>
    </div>
  </div>
</template>
