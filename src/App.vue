<script setup lang="ts">
import Navbar from './components/Navbar.vue';

// Direct static asset link for instant loading (0ms)
const logoUrl = import.meta.env.VITE_LOGO_URL || '/logo.png';
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[#F9FBFA] text-stone-900 font-sans selection:bg-[#E8F6F8] selection:text-[#1E7B85]">
    <!-- Navbar Component -->
    <Navbar />

    <!-- Main View Viewport with subtle Kirikú ambient color tints -->
    <main class="flex-1 relative overflow-hidden">
      <!-- Decorative ambient color glows from Kirikú palette -->
      <div class="absolute top-0 left-1/4 w-96 h-96 bg-[#289EAB]/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div class="absolute top-24 right-1/4 w-96 h-96 bg-[#F58F38]/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div class="absolute bottom-10 left-1/3 w-96 h-96 bg-[#EB455F]/5 rounded-full blur-3xl pointer-events-none -z-10"></div>

      <router-view />
    </main>

    <!-- Clean Footer (sin las opciones de navegación repetidas abajo) -->
    <footer class="bg-white border-t border-stone-200 mt-auto py-6">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div class="flex items-center gap-2">
            <img 
              :src="logoUrl" 
              @error="(e: any) => e.target.src = '/logo.png'"
              alt="Kirikú" 
              class="h-8 w-auto object-contain" 
            />
          </div>

          <div class="text-xs text-stone-500">
            © Kirikú – Voluntariado Social. Todos los derechos reservados.
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
