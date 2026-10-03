<script setup lang="ts">
import { LayoutDashboard, ArrowRight, CheckSquare, Users, ShieldCheck } from 'lucide-vue-next';
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-16">
    <div class="relative bg-white border border-[#289EAB]/30 rounded-3xl p-10 text-center shadow-sm overflow-hidden">
      <!-- Top color banner accent -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

      <div class="w-14 h-14 bg-[#E8F6F8] text-[#289EAB] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
        <LayoutDashboard class="w-7 h-7" />
      </div>

      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-3">
        <ShieldCheck class="w-3.5 h-3.5 text-[#289EAB]" />
        <span>Panel Interno</span>
      </div>

      <h1 class="text-3xl font-extrabold text-stone-900 mb-2">
        Panel de Administración
      </h1>
      <p class="text-stone-600 text-sm max-w-md mx-auto mb-8 leading-relaxed">
        Vista principal de administración para la supervisión de convocatorias, postulaciones y donaciones.
      </p>

      <div class="flex flex-wrap items-center justify-center gap-3 mb-6">
        <router-link
          to="/admin/revision"
          class="px-5 py-2.5 bg-[#289EAB] hover:bg-[#1E7B85] text-white rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-xs"
        >
          <CheckSquare class="w-4 h-4" />
          <span>Revisión de Proyectos</span>
          <ArrowRight class="w-3.5 h-3.5 opacity-80" />
        </router-link>
        <router-link
          to="/admin/postulantes"
          class="px-5 py-2.5 bg-[#F58F38] hover:bg-[#D47422] text-white rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-xs"
        >
          <Users class="w-4 h-4" />
          <span>Banco de Postulantes</span>
          <ArrowRight class="w-3.5 h-3.5 opacity-80" />
        </router-link>
      </div>

      <div class="inline-flex items-center text-xs text-stone-500 font-mono bg-stone-100 border border-stone-200 px-3.5 py-1.5 rounded-lg">
        src/views/admin/AdminDashboardView.vue
      </div>
    </div>
  </div>
</template>
