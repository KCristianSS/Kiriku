<script setup lang="ts">
import { UserCheck, Sparkles } from 'lucide-vue-next';
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-16">
    <div class="relative bg-white border border-[#F58F38]/30 rounded-3xl p-10 text-center shadow-sm overflow-hidden">
      <!-- Top color banner accent -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#F58F38] via-[#EB455F] to-[#289EAB]"></div>

      <div class="w-14 h-14 bg-[#FEF4EC] text-[#F58F38] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
        <UserCheck class="w-7 h-7" />
      </div>

      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF4EC] text-[#D47422] text-xs font-semibold mb-3">
        <Sparkles class="w-3.5 h-3.5 text-[#EB455F]" />
        <span>Módulo de Postulaciones</span>
      </div>

      <h1 class="text-3xl font-extrabold text-stone-900 mb-2">
        Formulario de Postulación
      </h1>
      <p class="text-stone-600 text-sm max-w-md mx-auto mb-6 leading-relaxed">
        Vista destinada al registro y postulación de voluntarios a las iniciativas de Kirikú.
      </p>

      <div class="inline-flex items-center text-xs text-stone-500 font-mono bg-stone-100 border border-stone-200 px-3.5 py-1.5 rounded-lg">
        src/views/ApplyView.vue
      </div>
    </div>
  </div>
</template>
