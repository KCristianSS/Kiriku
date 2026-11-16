import React from 'react';
import { CheckSquare } from 'lucide-react';

export const ProjectReviewView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="border border-stone-200 rounded-2xl p-10 text-center bg-white shadow-xs">
        <div className="w-12 h-12 bg-[#FEF4EC] text-[#F58F38] rounded-xl flex items-center justify-center mx-auto mb-4">
          <CheckSquare className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-stone-900 mb-2">
          Revisión de Proyectos
        </h1>
        <p className="text-stone-600 text-sm max-w-md mx-auto mb-6">
          Vista destinada a la auditoría, aprobación o rechazo de proyectos propuestos por organizaciones.
        </p>

        <div className="inline-flex items-center text-xs text-stone-400 font-mono bg-stone-100 px-3 py-1.5 rounded-lg">
          src/views/admin/ProjectReviewView.tsx
        </div>
      </div>
    </div>
  );
};

export default ProjectReviewView;
