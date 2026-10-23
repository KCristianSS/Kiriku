import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import AdultWarningModal from '../components/AdultWarningModal';
import type { CreatePostulantePayload, Proyecto, ValidarEdadResponse } from '../types';
import {
  UserCheck,
  Building2,
  MapPin,
  Calendar,
  Users,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ClipboardList,
  HeartHandshake,
  Check,
  ExternalLink,
  Info,
} from 'lucide-react';

export const ApplyView: React.FC = () => {
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Form State
  const [form, setForm] = useState<CreatePostulantePayload>({
    nombres: '',
    apellidos: '',
    email: '',
    ci: '',
    telefono: '',
    fecha_nacimiento: searchParams.get('fecha') || '',
    profesion_ocupacion: '',
    habilidades: '',
    motivacion: '',
    proyecto_id: routeId || '',
    confirmacion_mayor_edad: false,
  });

  // UI State
  const [projects, setProjects] = useState<Proyecto[]>([]);
  const [selectedProject, setSelectedProject] = useState<Proyecto | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{
    postulacion_id: number | string;
    postulante_id: number | string;
    edad_calculada?: number;
    etapas_creadas?: number;
  } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdultModal, setShowAdultModal] = useState(false);
  const [isValidatingAge, setIsValidatingAge] = useState(false);
  const [, setAgeValidationResult] = useState<ValidarEdadResponse | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Load all projects
  useEffect(() => {
    async function loadProjects() {
      setLoadingProjects(true);
      try {
        const data = await api.getProyectos({ estado: 'aprobado' });
        setProjects(data);

        const currentId = routeId || form.proyecto_id;
        if (currentId) {
          const found = data.find((p) => String(p.id) === String(currentId));
          if (found) {
            setSelectedProject(found);
            if (found.es_mayor_edad && !form.confirmacion_mayor_edad) {
              setShowAdultModal(true);
            }
          } else {
            // Try fetching by id directly
            try {
              const single = await api.getProyectoById(currentId);
              if (single) {
                setSelectedProject(single);
                if (single.es_mayor_edad && !form.confirmacion_mayor_edad) {
                  setShowAdultModal(true);
                }
              }
            } catch (e) {
              console.error('Error fetching project by id:', e);
            }
          }
        }
      } catch (err) {
        console.error('Error loading projects in ApplyView:', err);
      } finally {
        setLoadingProjects(false);
      }
    }
    loadProjects();
  }, [routeId]);

  // Real-time age calculation
  const calculatedAge = useMemo<number | null>(() => {
    if (!form.fecha_nacimiento) return null;
    const birth = new Date(form.fecha_nacimiento);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }, [form.fecha_nacimiento]);

  // Check if volunteer is underage for this project
  const isUnderageForProject = useMemo(() => {
    if (!selectedProject?.es_mayor_edad) return false;
    if (calculatedAge === null) return false;
    return calculatedAge < 18;
  }, [selectedProject, calculatedAge]);

  // Form validity check
  const isFormValid = useMemo(() => {
    if (!form.proyecto_id) return false;
    if (!form.nombres.trim() || !form.apellidos.trim()) return false;
    if (!form.ci.trim() || !form.email.trim()) return false;
    if (!form.fecha_nacimiento) return false;
    if (isUnderageForProject) return false;
    if (selectedProject?.es_mayor_edad && !form.confirmacion_mayor_edad) return false;
    return true;
  }, [form, isUnderageForProject, selectedProject]);

  const availableProjects = useMemo(() => {
    return projects.filter((p) => p.estado === 'aprobado');
  }, [projects]);

  // Server-side age validation trigger (KIR-99)
  const triggerServerAgeValidation = useCallback(async (projId: string | number, birthDate: string) => {
    if (!projId || !birthDate) {
      setAgeValidationResult(null);
      return;
    }
    setIsValidatingAge(true);
    try {
      const res = await api.validateAge({
        proyecto_id: projId,
        fecha_nacimiento: birthDate,
      });
      setAgeValidationResult(res);
    } catch (err) {
      console.warn('Pre-validation check fallback to local calculation:', err);
    } finally {
      setIsValidatingAge(false);
    }
  }, []);

  useEffect(() => {
    if (form.fecha_nacimiento && form.proyecto_id) {
      triggerServerAgeValidation(form.proyecto_id, form.fecha_nacimiento);
    } else {
      setAgeValidationResult(null);
    }
  }, [form.fecha_nacimiento, form.proyecto_id, triggerServerAgeValidation]);

  const selectProject = (proj: Proyecto) => {
    setSelectedProject(proj);
    setForm((prev) => ({ ...prev, proyecto_id: proj.id }));
    setLocalError(null);

    if (proj.es_mayor_edad && !form.confirmacion_mayor_edad) {
      setShowAdultModal(true);
    }

    if (form.fecha_nacimiento) {
      triggerServerAgeValidation(proj.id, form.fecha_nacimiento);
    }
  };

  const handleModalConfirm = (payload?: { confirmedDate?: string }) => {
    setShowAdultModal(false);
    setForm((prev) => ({
      ...prev,
      confirmacion_mayor_edad: true,
      fecha_nacimiento: payload?.confirmedDate && !prev.fecha_nacimiento ? payload.confirmedDate : prev.fecha_nacimiento,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!isFormValid) {
      if (isUnderageForProject) {
        setLocalError(
          `Este proyecto requiere ser mayor de edad (+18 años). Tu edad actual calculada es de ${calculatedAge} años. No es posible enviar la postulación.`
        );
      } else if (selectedProject?.es_mayor_edad && !form.confirmacion_mayor_edad) {
        setLocalError('Debes aceptar la declaración jurada obligatoria de mayoría de edad.');
      } else {
        setLocalError('Por favor completa todos los campos obligatorios antes de continuar.');
      }
      return;
    }

    if (selectedProject?.es_mayor_edad) {
      try {
        const validation = await api.validateAge({
          proyecto_id: form.proyecto_id,
          fecha_nacimiento: form.fecha_nacimiento,
        });
        if (!validation.es_elegible) {
          setLocalError(validation.mensaje);
          return;
        }
      } catch (err: any) {
        console.warn('Backend age pre-check error, proceeding to form submit:', err);
      }
    }

    setIsSubmitting(true);
    try {
      const res = await api.submitApplication({
        ...form,
        ci: form.ci.trim().toUpperCase(),
        email: form.email.trim().toLowerCase(),
      });
      setSuccessData(res);
      setSubmissionSuccess(true);
    } catch (err: any) {
      setLocalError(
        err?.response?.data?.error || 'Ocurrió un error al registrar la postulación en la base de datos.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmissionSuccess(false);
    setSuccessData(null);
    setAgeValidationResult(null);
    setForm({
      nombres: '',
      apellidos: '',
      email: '',
      ci: '',
      telefono: '',
      fecha_nacimiento: '',
      profesion_ocupacion: '',
      habilidades: '',
      motivacion: '',
      proyecto_id: selectedProject?.id || '',
      confirmacion_mayor_edad: false,
    });
  };

  const goToTracking = () => {
    navigate(`/seguimiento?busqueda=${encodeURIComponent(form.ci.trim())}`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      {/* Breadcrumb & Back button */}
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-stone-600 hover:text-[#289EAB] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Catálogo de Proyectos</span>
        </button>

        <span className="text-xs text-stone-500 font-medium">
          Historia: <strong className="text-stone-700">KIR-17: Validar Mayoría de Edad</strong>
        </span>
      </div>

      {/* Success Screen / Modal after real DB registration */}
      {submissionSuccess ? (
        <div className="bg-white rounded-3xl border border-emerald-200 p-8 sm:p-12 text-center shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-[#289EAB] to-[#F58F38]"></div>

          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-50/50">
            <CheckCircle2 className="w-12 h-12" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Registro Guardado en Supabase</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 mb-3 tracking-tight">
            ¡Postulación Registrada Exitosamente!
          </h2>

          <p className="text-sm sm:text-base text-stone-600 max-w-lg mx-auto mb-8 leading-relaxed">
            Muchas gracias, <strong className="text-stone-900">{form.nombres} {form.apellidos}</strong>. Tu solicitud ha sido vinculada al proyecto y ha iniciado el proceso de evaluación de 5 etapas de Kirikú.
          </p>

          {/* Registration Summary Card */}
          <div className="max-w-md mx-auto bg-stone-50 border border-stone-200 rounded-2xl p-5 text-left mb-8 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">Proyecto Vinculado:</span>
              <span className="font-bold text-stone-900 text-right">{selectedProject?.titulo}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">Postulante (CI):</span>
              <span className="font-mono font-semibold text-stone-800">{form.ci}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">Correo Electrónico:</span>
              <span className="font-mono text-stone-800">{form.email}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">Edad Validada:</span>
              <span className="font-mono font-semibold text-emerald-700">{calculatedAge} años (Mayor de edad cumplida)</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">ID de Postulación en BD:</span>
              <span className="font-mono text-xs text-[#289EAB] font-bold">{successData?.postulacion_id}</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-stone-200">
              <span className="text-stone-500">Etapas Inicializadas:</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                <Check className="w-3.5 h-3.5" />
                5 Etapas creadas en tiempo real
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <button
              type="button"
              onClick={goToTracking}
              className="w-full sm:w-auto flex-1 py-3 px-6 bg-[#289EAB] hover:bg-[#1E7B85] text-white font-semibold rounded-xl text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Ver Seguimiento en Vivo</span>
              <ExternalLink className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="w-full sm:w-auto py-3 px-5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
            >
              Nueva Postulación
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Header Banner */}
          <div className="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xs overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#E8F6F8] text-[#289EAB] flex items-center justify-center shrink-0">
                  <UserCheck className="w-7 h-7" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#F58F38]" />
                    <span>KIR-17: Validación de Mayoría de Edad</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
                    Registrar Postulación
                  </h1>
                  <p className="text-stone-600 text-xs sm:text-sm mt-1">
                    Completa tus datos y verifica los requisitos legales y de edad para participar en Kirikú.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 1: Vinculación de Proyecto */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#289EAB]" />
                <h2 className="text-lg font-bold text-stone-900">1. Vinculación con el Proyecto</h2>
              </div>
              <span className="text-xs text-stone-500 font-medium">* Requisito Obligatorio</span>
            </div>

            {selectedProject ? (
              <div className="bg-gradient-to-br from-stone-50 to-[#E8F6F8]/30 rounded-2xl p-5 border border-stone-200 relative">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E7B85] bg-[#E8F6F8] px-2.5 py-0.5 rounded-md">
                        <Building2 className="w-3.5 h-3.5" />
                        {selectedProject.organizacion?.nombre || 'Organización Aliada'}
                      </span>

                      {selectedProject.es_mayor_edad ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-md border border-amber-200">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                          Mayoría de Edad (+18) Requerida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-md">
                          Convocatoria Abierta (Sin restricción de edad)
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-stone-900">{selectedProject.titulo}</h3>
                    <p className="text-xs text-stone-600 line-clamp-2 mt-1 leading-relaxed">{selectedProject.descripcion}</p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500 mt-3">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-stone-400" />
                        {selectedProject.ubicacion}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        Cupos: <strong className="font-mono text-stone-800">{selectedProject.cupos_disponibles}</strong>
                      </span>
                      {selectedProject.fecha_inicio && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-stone-400" />
                          Inicio: {new Date(selectedProject.fecha_inicio).toLocaleDateString('es-BO')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0">
                    {selectedProject.es_mayor_edad && (
                      <button
                        type="button"
                        onClick={() => setShowAdultModal(true)}
                        className="px-3.5 py-2 text-xs font-semibold text-amber-800 hover:text-amber-900 bg-amber-50 border border-amber-300 rounded-xl hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                        <span>Ver Aviso Legal (+18)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProject(null);
                        setForm((prev) => ({ ...prev, proyecto_id: '' }));
                      }}
                      className="px-3.5 py-2 text-xs font-semibold text-[#289EAB] hover:text-[#1E7B85] bg-white border border-[#289EAB]/30 rounded-xl hover:bg-[#E8F6F8] transition-colors cursor-pointer"
                    >
                      Cambiar Proyecto
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-stone-600">
                  Selecciona la iniciativa comunitaria a la que deseas postularte:
                </p>

                {loadingProjects ? (
                  <div className="p-8 text-center text-xs text-stone-500">
                    Cargando proyectos desde la base de datos...
                  </div>
                ) : availableProjects.length === 0 ? (
                  <div className="p-6 bg-stone-50 rounded-2xl text-center text-xs text-stone-500">
                    No hay proyectos disponibles en este momento.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                    {availableProjects.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => selectProject(p)}
                        className="p-4 rounded-2xl border border-stone-200 hover:border-[#289EAB] bg-white hover:bg-[#E8F6F8]/20 transition-all cursor-pointer flex flex-col justify-between group"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                            <span className="font-medium text-[#1E7B85] truncate">{p.organizacion?.nombre || 'Kirikú'}</span>
                            {p.es_mayor_edad ? (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3 text-amber-700" />
                                +18 Años
                              </span>
                            ) : (
                              <span className="bg-blue-50 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                                Sin restricción
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-stone-900 group-hover:text-[#289EAB] transition-colors mb-1 line-clamp-1">
                            {p.titulo}
                          </h4>
                          <p className="text-xs text-stone-600 line-clamp-2">{p.descripcion}</p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-stone-400" />
                            {p.ubicacion}
                          </span>
                          <span className="text-[#289EAB] font-semibold group-hover:underline">Vincular &rarr;</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 2: Datos Personales del Postulante & Validación de Edad */}
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-[#F58F38]" />
                  <h2 className="text-lg font-bold text-stone-900">2. Datos Personales y Verificación de Edad</h2>
                </div>
                <span className="text-xs text-stone-500 font-medium">Validación en tiempo real</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Nombres */}
                <div>
                  <label htmlFor="nombres" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Nombres <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="nombres"
                    value={form.nombres}
                    onChange={(e) => setForm({ ...form, nombres: e.target.value })}
                    type="text"
                    required
                    placeholder="Ej. Juan Carlos"
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
                  />
                </div>

                {/* Apellidos */}
                <div>
                  <label htmlFor="apellidos" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Apellidos <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="apellidos"
                    value={form.apellidos}
                    onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
                    type="text"
                    required
                    placeholder="Ej. Pérez Quispe"
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
                  />
                </div>

                {/* Cédula de Identidad (CI) */}
                <div>
                  <label htmlFor="ci" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Cédula de Identidad (CI) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="ci"
                    value={form.ci}
                    onChange={(e) => setForm({ ...form, ci: e.target.value })}
                    type="text"
                    required
                    placeholder="Ej. 8492019 LP"
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white font-mono transition-all"
                  />
                  <p className="text-[11px] text-stone-500 mt-1">Se contrastará con tu fecha de nacimiento en la Etapa 1.</p>
                </div>

                {/* Correo Electrónico */}
                <div>
                  <label htmlFor="email" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Correo Electrónico <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    type="email"
                    required
                    placeholder="Ej. voluntario@ejemplo.com"
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
                  />
                </div>

                {/* Teléfono / WhatsApp */}
                <div>
                  <label htmlFor="telefono" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    id="telefono"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    type="tel"
                    placeholder="Ej. +591 71234567"
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white font-mono transition-all"
                  />
                </div>

                {/* Fecha de Nacimiento */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="fecha_nacimiento" className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                      Fecha de Nacimiento <span className="text-rose-500">*</span>
                    </label>
                    {isValidatingAge && (
                      <span className="text-[11px] text-[#289EAB] flex items-center gap-1 font-medium">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#289EAB] animate-ping"></span>
                        Validando...
                      </span>
                    )}
                  </div>

                  <input
                    id="fecha_nacimiento"
                    value={form.fecha_nacimiento}
                    onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                    type="date"
                    required
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white font-mono transition-all"
                  />

                  {/* Real-time Age Validation Feedback */}
                  {calculatedAge !== null && (
                    <div className="mt-3">
                      {isUnderageForProject ? (
                        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1.5">
                          <div className="flex items-center gap-2 font-bold text-rose-900">
                            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>Bloqueo por Minoría de Edad: {calculatedAge} años</span>
                          </div>
                          <p className="leading-relaxed text-rose-700">
                            Este proyecto exige contar con <strong>18 años o más</strong> para actividades de campo y cobertura legal. No cumples con el requisito mínimo para postular a esta convocatoria.
                          </p>
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProject(null);
                                setForm((prev) => ({ ...prev, proyecto_id: '' }));
                              }}
                              className="text-xs font-bold text-rose-800 underline hover:text-rose-950 cursor-pointer"
                            >
                              Elegir un proyecto sin restricción de edad &rarr;
                            </button>
                          </div>
                        </div>
                      ) : selectedProject?.es_mayor_edad ? (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            <strong>Edad verificada:</strong> Tienes {calculatedAge} años. Cumples con el requisito legal de mayoría de edad para este proyecto.
                          </span>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-center gap-2 font-medium">
                          <Info className="w-4 h-4 text-blue-600 shrink-0" />
                          <span>
                            Edad calculada: <strong>{calculatedAge} años</strong>. Este proyecto no tiene restricción de mayoría de edad.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 3: Perfil y Motivación del Postulante */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                <div className="flex items-center gap-2">
                  <HeartHandshake className="w-5 h-5 text-[#EB455F]" />
                  <h2 className="text-lg font-bold text-stone-900">3. Perfil, Habilidades y Motivación</h2>
                </div>
                <span className="text-xs text-stone-500 font-medium">Información para evaluación</span>
              </div>

              <div className="space-y-5">
                <div>
                  <label htmlFor="profesion" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Profesión u Ocupación Actual
                  </label>
                  <input
                    id="profesion"
                    value={form.profesion_ocupacion || ''}
                    onChange={(e) => setForm({ ...form, profesion_ocupacion: e.target.value })}
                    type="text"
                    placeholder="Ej. Estudiante de Biología / Profesional en Sistemas / Docente"
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="habilidades" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Habilidades y Experiencia Relevante
                  </label>
                  <textarea
                    id="habilidades"
                    value={form.habilidades || ''}
                    onChange={(e) => setForm({ ...form, habilidades: e.target.value })}
                    rows={2}
                    placeholder="Ej. Trabajo en equipo, primeros auxilios, facilitación de talleres con niños, manejo de herramientas..."
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all resize-none"
                  ></textarea>
                </div>

                <div>
                  <label htmlFor="motivacion" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    ¿Por qué te gustaría participar en este voluntariado?
                  </label>
                  <textarea
                    id="motivacion"
                    value={form.motivacion || ''}
                    onChange={(e) => setForm({ ...form, motivacion: e.target.value })}
                    rows={3}
                    placeholder="Comparte tu motivación e interés en contribuir con las iniciativas comunitarias de Kirikú..."
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all resize-none"
                  ></textarea>
                </div>
              </div>
            </div>

            {/* SECTION 4: Requisito de Mayoría de Edad */}
            {selectedProject?.es_mayor_edad && (
              <div
                className={`rounded-3xl border p-6 sm:p-8 space-y-4 transition-all ${
                  isUnderageForProject
                    ? 'bg-rose-50/70 border-rose-200 opacity-60'
                    : form.confirmacion_mayor_edad
                    ? 'bg-emerald-50/50 border-emerald-300'
                    : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert
                      className={`w-5 h-5 shrink-0 ${
                        isUnderageForProject
                          ? 'text-rose-600'
                          : form.confirmacion_mayor_edad
                          ? 'text-emerald-700'
                          : 'text-amber-600'
                      }`}
                    />
                    <h3 className="font-bold text-sm sm:text-base text-stone-900">
                      Declaración Obligatoria de Mayoría de Edad (+18)
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdultModal(true)}
                    className="text-xs font-semibold text-amber-800 underline hover:text-amber-950 cursor-pointer shrink-0"
                  >
                    Leer condiciones completas
                  </button>
                </div>

                <p className="text-xs text-stone-700 leading-relaxed">
                  Las actividades de este proyecto implican trabajo en terreno y requieren obligatoriamente tener 18 años cumplidos al momento del inicio. El documento de identidad será requerido en la primera etapa de evaluación.
                </p>

                <label
                  className={`flex items-start gap-3 pt-2 cursor-pointer p-3 rounded-xl border transition-all ${
                    isUnderageForProject
                      ? 'cursor-not-allowed bg-stone-100 border-stone-200'
                      : form.confirmacion_mayor_edad
                      ? 'bg-white border-emerald-300 text-emerald-950 shadow-xs'
                      : 'bg-white/80 border-amber-200 text-stone-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.confirmacion_mayor_edad}
                    onChange={(e) => setForm({ ...form, confirmacion_mayor_edad: e.target.checked })}
                    disabled={isUnderageForProject}
                    className="w-4 h-4 text-[#289EAB] border-stone-300 rounded-sm focus:ring-[#289EAB] mt-0.5 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="text-xs font-medium leading-relaxed">
                    <span>
                      Certifico que tengo 18 años o más y acepto presentar mi documento de identidad en la verificación inicial.
                    </span>
                    {!form.confirmacion_mayor_edad && !isUnderageForProject && (
                      <span className="block text-[11px] text-amber-700 font-semibold mt-0.5">
                        * Casilla obligatoria para poder enviar la postulación.
                      </span>
                    )}
                  </div>
                </label>
              </div>
            )}

            {/* Error Notification Banner */}
            {localError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block mb-0.5">Validación de Postulación:</strong>
                  <span>{localError}</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="text-xs text-stone-500">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
                Los datos se validan y almacenan directamente en <strong>Supabase</strong>.
              </div>

              <button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isFormValid && !isSubmitting
                    ? 'bg-[#289EAB] hover:bg-[#1E7B85] text-white active:scale-98 shadow-md'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
                }`}
              >
                {isSubmitting ? (
                  <span>Validando y Guardando en Supabase...</span>
                ) : (
                  <>
                    <span>Enviar Postulación Inicial</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Adult Warning Modal Component */}
      <AdultWarningModal
        isOpen={showAdultModal}
        projectTitle={selectedProject?.titulo}
        projectLocation={selectedProject?.ubicacion}
        projectOrg={selectedProject?.organizacion?.nombre || 'Iniciativa Kirikú'}
        initialBirthDate={form.fecha_nacimiento}
        onConfirm={handleModalConfirm}
        onClose={() => setShowAdultModal(false)}
      />
    </div>
  );
};

export default ApplyView;
