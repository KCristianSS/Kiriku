import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import EvaluationStepper from '../components/EvaluationStepper';
import type { Postulante, EvaluacionEtapa } from '../types';
import {
  Search,
  Sparkles,
  Building2,
  Clock,
  AlertCircle,
  FileText,
  ArrowRight,
} from 'lucide-react';

interface TrackingItem {
  postulante: Postulante;
  postulacion: {
    id: number | string;
    estado_general: string;
    es_reasignacion: boolean;
    es_reenganche?: boolean;
    created_at: string;
    updated_at: string;
    proyecto: {
      id: number | string;
      titulo: string;
      ubicacion: string;
      portada_url?: string;
      organizacion_nombre?: string;
    };
    etapas: EvaluacionEtapa[];
  };
}

export const ApplicationStatusView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('busqueda') || '');
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TrackingItem[]>([]);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setHasSearched(true);
    setLoading(true);
    setError(null);
    try {
      const data = await api.trackApplication(query.trim());
      setResults(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Error al rastrear postulación');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = searchParams.get('busqueda');
    if (q) {
      setSearchInput(q);
      performSearch(q);
    }
  }, [searchParams, performSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchInput);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-8">
      {/* Header Banner */}
      <div className="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-10 shadow-xs overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-[#289EAB]" />
            <span>Consulta en Tiempo Real</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight mb-2">
            Seguimiento de Postulación
          </h1>
          <p className="text-stone-600 text-xs sm:text-sm leading-relaxed mb-6">
            Ingresa tu número de Cédula de Identidad (CI) o Correo Electrónico registrado para consultar en qué etapa de evaluación se encuentra tu postulación.
          </p>

          {/* Search input box */}
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                type="text"
                required
                placeholder="Ej. 8492019 LP o correo@ejemplo.com"
                className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !searchInput.trim()}
              className="px-6 py-3 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span>Consultando...</span>
              ) : (
                <>
                  <span>Consultar Estado</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-stone-200 border-t-[#289EAB] mb-3"></div>
          <p className="text-sm text-stone-500 font-medium">Buscando postulación en la base de datos...</p>
        </div>
      ) : hasSearched && results.length === 0 ? (
        /* No results state */
        <div className="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center">
          <div className="w-16 h-16 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-stone-900 mb-1">No se encontraron postulaciones</h3>
          <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto mb-6">
            No encontramos registros asociados al CI o correo &quot;{searchInput}&quot;. Verifica que los datos coincidan con los que registraste al postularte.
          </p>
          <Link
            to="/postular"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#289EAB] text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-[#1E7B85] transition-colors"
          >
            <span>Ir al Formulario de Postulación</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : results.length > 0 ? (
        /* Results list */
        <div className="space-y-8">
          {results.map((item) => (
            <div
              key={item.postulacion.id}
              className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs"
            >
              {/* Card Header with Applicant & Project Info */}
              <div className="p-6 sm:p-8 border-b border-stone-100 bg-stone-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#1E7B85] bg-[#E8F6F8] px-2 py-0.5 rounded-md">
                        <Building2 className="w-3.5 h-3.5" />
                        {item.postulacion.proyecto?.organizacion_nombre || 'Kirikú'}
                      </span>
                      <span>·</span>
                      <span className="font-mono">
                        {new Date(item.postulacion.created_at).toLocaleDateString('es-BO')}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
                      {item.postulacion.proyecto?.titulo}
                    </h2>
                  </div>

                  {/* General Status Badge */}
                  <div className="self-start sm:self-center">
                    <span
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        item.postulacion.estado_general === 'aprobado'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : item.postulacion.estado_general === 'rechazado'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {item.postulacion.estado_general === 'en_proceso'
                        ? 'En Proceso de Evaluación'
                        : item.postulacion.estado_general}
                    </span>
                  </div>
                </div>

                {/* Applicant metadata details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white rounded-2xl p-4 border border-stone-200">
                  <div>
                    <span className="text-stone-400 block mb-0.5">Postulante:</span>
                    <strong className="text-stone-800">
                      {item.postulante.nombres} {item.postulante.apellidos}
                    </strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block mb-0.5">Cédula (CI):</span>
                    <strong className="font-mono text-stone-800">{item.postulante.ci}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block mb-0.5">Correo:</span>
                    <span className="font-mono text-stone-700 truncate block">{item.postulante.email}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block mb-0.5">Profesión / Ocupación:</span>
                    <span className="text-stone-700">{item.postulante.profesion_ocupacion || 'No especificada'}</span>
                  </div>
                </div>
              </div>

              {/* Stepper Component (5 stages from DB) */}
              <div className="p-6 sm:p-8">
                <h3 className="text-sm font-bold text-stone-900 mb-6 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#289EAB]" />
                  <span>Progreso en las 5 Etapas de Evaluación</span>
                </h3>

                <EvaluationStepper etapas={item.postulacion.etapas || []} interactive={false} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default ApplicationStatusView;
