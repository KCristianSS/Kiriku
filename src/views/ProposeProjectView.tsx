import React from 'react';
import { Building2, Sparkles } from 'lucide-react';

export const ProposeProjectView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="relative bg-white border border-[#289EAB]/30 rounded-3xl p-10 text-center shadow-sm overflow-hidden">
        {/* Top color banner accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#1E4867] to-[#F58F38]"></div>

        <div className="w-14 h-14 bg-[#E8F6F8] text-[#289EAB] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
          <Building2 className="w-7 h-7" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[#F58F38]" />
          <span>Alianzas & ONGs</span>
        </div>

        <h1 className="text-3xl font-extrabold text-stone-900 mb-2">
          Proponer Proyecto
        </h1>
        <p className="text-stone-600 text-sm max-w-md mx-auto mb-6 leading-relaxed">
          Vista destinada al registro y propuesta de proyectos de voluntariado por parte de organizaciones e instituciones aliadas.
        </p>

        <div className="inline-flex items-center text-xs text-stone-500 font-mono bg-stone-100 border border-stone-200 px-3.5 py-1.5 rounded-lg">
          src/views/ProposeProjectView.tsx
        </div>
      </div>
    </div>
  );
};

export default ProposeProjectView;
