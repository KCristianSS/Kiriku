import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { name: 'Catálogo de Proyectos', path: '/' },
  { name: 'Postularse', path: '/postular' },
  { name: 'Seguimiento', path: '/seguimiento' },
  { name: 'Proponer Proyecto', path: '/proponer' },
  { name: 'Donaciones', path: '/donaciones' },
  { name: 'Administración', path: '/admin' },
];

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const logoUrl = import.meta.env.VITE_LOGO_URL || '/logo.png';

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md shadow-xs border-b border-stone-200">
      {/* Top 3-Color Brand Stripe (Teal, Orange, Coral) from Kirikú Logo */}
      <div className="h-1.5 w-full flex">
        <div className="flex-1 bg-[#289EAB]"></div>
        <div className="flex-1 bg-[#F58F38]"></div>
        <div className="flex-1 bg-[#EB455F]"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between py-3 gap-3">
          {/* Logo: Cropped, Large & Transparent */}
          <div
            className="flex items-center cursor-pointer transition-transform hover:scale-102"
            onClick={() => navigate('/')}
            title="Kirikú - Inicio"
          >
            <img
              src={logoUrl}
              onError={(e: any) => {
                e.target.src = '/logo.png';
              }}
              alt="Kirikú"
              className="h-12 sm:h-14 w-auto object-contain drop-shadow-2xs"
            />
          </div>

          {/* Horizontal Navigation Links */}
          <nav className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#289EAB] text-white shadow-xs'
                      : 'text-stone-700 hover:text-[#1E7B85] hover:bg-[#E8F6F8]'
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
