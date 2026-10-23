import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import ProjectsCatalogView from './views/ProjectsCatalogView';
import ApplyView from './views/ApplyView';
import ApplicationStatusView from './views/ApplicationStatusView';
import ProposeProjectView from './views/ProposeProjectView';
import DonationsView from './views/DonationsView';
import LoginView from './views/LoginView';
import AdminDashboardView from './views/admin/AdminDashboardView';
import ProjectReviewView from './views/admin/ProjectReviewView';
import ApplicantsPoolView from './views/admin/ApplicantsPoolView';
import RolesManagementView from './views/admin/RolesManagementView';

export const App: React.FC = () => {
  const logoUrl = import.meta.env.VITE_LOGO_URL || '/logo.png';

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-[#F9FBFA] text-stone-900 font-sans selection:bg-[#E8F6F8] selection:text-[#1E7B85]">
        {/* Navbar Component */}
        <Navbar />

        {/* Main View Viewport with subtle Kirikú ambient color tints */}
        <main className="flex-1 relative overflow-hidden">
          {/* Decorative ambient color glows from Kirikú palette */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#289EAB]/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
          <div className="absolute top-24 right-1/4 w-96 h-96 bg-[#F58F38]/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
          <div className="absolute bottom-10 left-1/3 w-96 h-96 bg-[#EB455F]/5 rounded-full blur-3xl pointer-events-none -z-10"></div>

          <Routes>
            <Route path="/login" element={<LoginView />} />
            <Route path="/" element={<ProjectsCatalogView />} />
            <Route path="/postular" element={<ApplyView />} />
            <Route path="/postular/:id" element={<ApplyView />} />
            <Route path="/seguimiento" element={<ApplicationStatusView />} />
            <Route path="/proponer" element={<ProposeProjectView />} />
            <Route path="/donaciones" element={<DonationsView />} />

            {/* Admin Routes with Auth Guard */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminDashboardView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/revision"
              element={
                <ProtectedRoute>
                  <ProjectReviewView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/postulantes"
              element={
                <ProtectedRoute>
                  <ApplicantsPoolView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/roles"
              element={
                <ProtectedRoute>
                  <RolesManagementView />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Clean Footer */}
        <footer className="bg-white border-t border-stone-200 mt-auto py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center gap-2">
                <img
                  src={logoUrl}
                  onError={(e: any) => {
                    e.target.src = '/logo.png';
                  }}
                  alt="Kirikú"
                  className="h-8 w-auto object-contain"
                />
              </div>

              <div className="text-xs text-stone-500">
                © Kirikú – Voluntariado Social. Todos los derechos reservados.
              </div>
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
};

export default App;
