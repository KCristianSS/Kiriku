import React from 'react';
import { Users } from 'lucide-react';

export const ApplicantsPoolView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="border border-stone-200 rounded-2xl p-10 text-center bg-white shadow-xs">
        <div className="w-12 h-12 bg-[#E8F6F8] text-[#289EAB] rounded-xl flex items-center justify-center mx-auto mb-4">
          <Users className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-stone-900 mb-2">
          Banco de Postulantes & Evaluación
        </h1>
        <p className="text-stone-600 text-sm max-w-md mx-auto mb-6">
          Vista destinada a la gestión del banco de voluntarios, proceso de evaluación y asignación a proyectos.
        </p>

        <div className="inline-flex items-center text-xs text-stone-400 font-mono bg-stone-100 px-3 py-1.5 rounded-lg">
          src/views/admin/ApplicantsPoolView.tsx
        </div>
      </div>
    </div>
  );
};

export default ApplicantsPoolView;
