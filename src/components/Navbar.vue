<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();

// Direct static asset link for instant loading (0ms)
const logoUrl = import.meta.env.VITE_LOGO_URL || '/logo.png';

const navItems = [
  { name: 'Catálogo de Proyectos', path: '/' },
  { name: 'Seguimiento', path: '/seguimiento' },
  { name: 'Proponer Proyecto', path: '/proponer' },
  { name: 'Donaciones', path: '/donaciones' },
  { name: 'Administración', path: '/admin' },
];

function navigate(path: string) {
  router.push(path);
}
</script>

<template>
  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-md shadow-xs border-b border-stone-200">
    <!-- Top 3-Color Brand Stripe (Teal, Orange, Coral) from Kirikú Logo -->
    <div class="h-1.5 w-full flex">
      <div class="flex-1 bg-[#289EAB]"></div>
      <div class="flex-1 bg-[#F58F38]"></div>
      <div class="flex-1 bg-[#EB455F]"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex flex-col sm:flex-row items-center justify-between py-3 gap-3">
        <!-- Logo: Cropped, Large & Transparent from Supabase DB -->
        <div 
          class="flex items-center cursor-pointer transition-transform hover:scale-102"
          @click="navigate('/')"
          title="Kirikú - Inicio"
        >
          <img 
            :src="logoUrl" 
            @error="(e: any) => e.target.src = '/logo.png'"
            alt="Kirikú" 
            class="h-12 sm:h-14 w-auto object-contain drop-shadow-2xs" 
          />
        </div>

        <!-- Horizontal Navigation Links (Siempre visibles, sin menú hamburguesa ni barras) -->
        <nav class="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
          <button
            v-for="item in navItems"
            :key="item.path"
            @click="navigate(item.path)"
            :class="[
              'px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap',
              route.path === item.path || (item.path !== '/' && route.path.startsWith(item.path))
                ? 'bg-[#289EAB] text-white shadow-xs'
                : 'text-stone-700 hover:text-[#1E7B85] hover:bg-[#E8F6F8]'
            ]"
          >
            {{ item.name }}
          </button>
        </nav>
      </div>
    </div>
  </header>
</template>
