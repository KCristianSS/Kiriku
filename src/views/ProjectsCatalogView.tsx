import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import ProjectCard from '../components/ProjectCard';
import AdultWarningModal from '../components/AdultWarningModal';
import type { Proyecto, Organizacion } from '../types';
import {
  Search,
  MapPin,
  Sparkles,
  ArrowRight,
  Layers,
} from 'lucide-react';

export const ProjectsCatalogView: React.FC = () => {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Proyecto[]>([]);
  const [organizations, setOrganizations] = useState<Organizacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [modalProject, setModalProject] = useState<Proyecto | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [projs, orgs] = await Promise.all([
          api.getProyectos({ estado: 'aprobado' }),
          api.getOrganizaciones(),
        ]);
        setProjects(projs);
        setOrganizations(orgs);
      } catch (err) {
        console.error('Error fetching catalog data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter approved projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (p.estado !== 'aprobado') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.titulo?.toLowerCase().includes(q);
        const matchDesc = p.descripcion?.toLowerCase().includes(q);
        const matchOrg = p.organizacion?.nombre?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchOrg) return false;
      }

      if (locationFilter && p.ubicacion !== locationFilter) {
        return false;
      }

      return true;
    });
  }, [projects, searchQuery, locationFilter]);

  // Unique locations from projects
  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    projects.forEach((p) => {
      if (p.ubicacion) locs.add(p.ubicacion);
    });
    return Array.from(locs);
  }, [projects]);

  // Handle apply button click on project card
  const handleApply = (project: Proyecto) => {
    if (project.es_mayor_edad) {
      setModalProject(project);
      setIsModalOpen(true);
    } else {
      navigate(`/postular/${project.id}`);
    }
  };

  // Confirm adult modal and proceed to application form
  const handleConfirmAdult = (payload?: { confirmedDate?: string }) => {
    setIsModalOpen(false);
    if (modalProject) {
      const search = payload?.confirmedDate
        ? `?fecha=${encodeURIComponent(payload.confirmedDate)}`
        : '';
      navigate(`/postular/${modalProject.id}${search}`);
    }
  };

  return (
    <div className="space-y-10 pb-16">
      {/* Hero Header with Kirikú branding */}
      <section className="relative bg-white border-b border-stone-200 overflow-hidden py-12 sm:py-16">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-4">
              <Sparkles className="w-3.5 h-3.5 text-[#F58F38]" />
              <span>Voluntariado Comunitario y Social</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-stone-900 tracking-tight leading-tight mb-4">
              Transforma vidas con <span className="text-[#289EAB]">Kirikú</span>
            </h1>

            <p className="text-stone-600 text-sm sm:text-base leading-relaxed mb-6">
              Explora las iniciativas activas de voluntariado, postúlate a proyectos comunitarios y forma parte de un proceso transparente de evaluación en 5 etapas.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/postular"
                className="px-5 py-2.5 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-sm font-semibold rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Formulario de Postulación</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                to="/seguimiento"
                className="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Consultar mi Estado</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Filters and Projects Catalog */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Search and Filter Bar */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text"
              placeholder="Buscar proyectos por título o descripción..."
              className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
            />
          </div>

          {/* Location Filter */}
          <div className="w-full sm:w-auto flex items-center gap-2">
            <div className="relative w-full sm:w-48">
              <MapPin className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full pl-8 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB] cursor-pointer"
              >
                <option value="">Todas las ubicaciones</option>
                {uniqueLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Projects Grid from Real Supabase Data */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-stone-200 border-t-[#289EAB] mb-3"></div>
            <p className="text-sm text-stone-500 font-medium">Cargando proyectos desde Supabase...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl border border-stone-200 p-8">
            <div className="w-14 h-14 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-stone-800 mb-1">No se encontraron proyectos</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Prueba cambiando el texto de búsqueda o los filtros aplicados.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onApply={handleApply}
              />
            ))}
          </div>
        )}
      </div>

      {/* Adult Warning Modal Component */}
      <AdultWarningModal
        isOpen={isModalOpen}
        projectTitle={modalProject?.titulo}
        projectLocation={modalProject?.ubicacion}
        projectOrg={modalProject?.organizacion?.nombre || 'Iniciativa Kirikú'}
        onConfirm={handleConfirmAdult}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default ProjectsCatalogView;
