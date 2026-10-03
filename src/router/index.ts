import { createRouter, createWebHistory } from 'vue-router';
import ProjectsCatalogView from '../views/ProjectsCatalogView.vue';
import ApplyView from '../views/ApplyView.vue';
import ApplicationStatusView from '../views/ApplicationStatusView.vue';
import ProposeProjectView from '../views/ProposeProjectView.vue';
import DonationsView from '../views/DonationsView.vue';
import AdminDashboardView from '../views/admin/AdminDashboardView.vue';
import ProjectReviewView from '../views/admin/ProjectReviewView.vue';
import ApplicantsPoolView from '../views/admin/ApplicantsPoolView.vue';

const routes = [
  {
    path: '/',
    name: 'catalog',
    component: ProjectsCatalogView,
  },
  {
    path: '/postular/:id',
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
  },
  {
    path: '/admin/revision',
    name: 'admin-review',
    component: ProjectReviewView,
  },
  {
    path: '/admin/postulantes',
    name: 'admin-applicants',
    component: ApplicantsPoolView,
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

export default router;
