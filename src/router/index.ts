import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import ProjectsCatalogView from '../views/ProjectsCatalogView.vue';
import ApplyView from '../views/ApplyView.vue';
import ApplicationStatusView from '../views/ApplicationStatusView.vue';
import ProposeProjectView from '../views/ProposeProjectView.vue';
import DonationsView from '../views/DonationsView.vue';
import AdminDashboardView from '../views/admin/AdminDashboardView.vue';
import ProjectReviewView from '../views/admin/ProjectReviewView.vue';
import ApplicantsPoolView from '../views/admin/ApplicantsPoolView.vue';
import RolesManagementView from '../views/admin/RolesManagementView.vue';
import LoginView from '../views/LoginView.vue';
import { supabaseAuth } from '../auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
  },
  {
    path: '/',
    name: 'catalog',
    component: ProjectsCatalogView,
  },
  {
    path: '/postular/:id?',
    name: 'apply',
    component: ApplyView,
  },
  {
    path: '/seguimiento',
    name: 'status',
    component: ApplicationStatusView,
  },
  {
    path: '/proponer',
    name: 'propose',
    component: ProposeProjectView,
  },
  {
    path: '/donaciones',
    name: 'donations',
    component: DonationsView,
  },
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: AdminDashboardView,
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/revision',
    name: 'admin-review',
    component: ProjectReviewView,
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/postulantes',
    name: 'admin-applicants',
    component: ApplicantsPoolView,
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/roles',
    name: 'admin-roles',
    component: RolesManagementView,
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    if (typeof window !== 'undefined' && localStorage.getItem('kiriku_admin_token')) {
      return true;
    }
    const { data } = (await supabaseAuth?.auth.getSession()) ?? { data: { session: null } };
    if (!data.session) {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
  }
  return true;
});

export default router;
