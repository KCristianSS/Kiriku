import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  FileCheck,
  UserCheck,
  Brain,
  Activity,
  Award,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { EvaluacionEtapa, EtapaNombre, EtapaEstado } from '../types';

interface Props {
  etapas: EvaluacionEtapa[];
  interactive?: boolean;
  onUpdateStage?: (payload: {
    etapaId: string | number;
    estado: EtapaEstado;
    comentarios?: string;
    evaluador?: string;
  }) => void;
}

const stageMetadata: Record<
  EtapaNombre,
  { label: string; short: string; description: string; icon: React.ComponentType<{ className?: string }> }
> = {
  inicial: {
    label: '1. Etapa Inicial',
    short: 'Inicial',
    description: 'Recepción y verificación de CI, mayoría de edad y requisitos formales.',
    icon: FileCheck,
  },
  tecnica: {
    label: '2. Evaluación Técnica',
    short: 'Técnica',
    description: 'Validación por el socio territorial de capacidades y perfil de voluntariado.',
    icon: Award,
  },
  personal: {
    label: '3. Entrevista Personal',
    short: 'Personal',
    description: 'Entrevista individual de motivación, compromiso y disponibilidad horaria.',
    icon: UserCheck,
  },
  competencias: {
    label: '4. Evaluación de Competencias',
    short: 'Competencias',
    description: 'Taller de dinámica grupal, resolución de dilemas éticos y trabajo en equipo.',
    icon: Brain,
  },
  salud_fisica_psicologica: {
    label: '5. Salud Física y Psicológica',
    short: 'Salud Integral',
    description: 'Dictamen de aptitud física y bienestar psicológico para actividades comunitarias.',
    icon: Activity,
  },
};

function getStageMeta(etapa: EtapaNombre) {
  return (
    stageMetadata[etapa] || {
      label: etapa,
      short: etapa,
      description: '',
      icon: FileCheck,
    }
  );
}

function normalizeState(estado: any): string {
  if (!estado) return 'pendiente';
  const s = String(estado).trim().toLowerCase();
  if (s === 'aprobada') return 'aprobado';
  if (s === 'rechazada') return 'rechazado';
  if (s === 'observada') return 'observado';
  if (s === 'en revision' || s === 'en_revisión' || s === 'en_revision') return 'en_revision';
  return s;
}

function getStatusBadge(estado: any) {
  const norm = normalizeState(estado);
  switch (norm) {
    case 'aprobado':
      return {
        text: 'Aprobada',
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        icon: CheckCircle2,
      };
    case 'en_revision':
      return {
        text: 'En Revisión',
        bg: 'bg-blue-50 text-blue-800 border-blue-200',
        icon: Clock,
      };
    case 'observado':
      return {
        text: 'Observada',
        bg: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: AlertCircle,
      };
    case 'rechazado':
      return {
        text: 'No Aprobada',
        bg: 'bg-rose-50 text-rose-800 border-rose-200',
        icon: XCircle,
      };
    default:
      return {
        text: 'Pendiente',
        bg: 'bg-stone-50 text-stone-600 border-stone-200',
        icon: AlertCircle,
      };
  }
}

export const EvaluationStepper: React.FC<Props> = ({
  etapas,
  interactive = false,
  onUpdateStage,
}) => {
  const [expandedStage, setExpandedStage] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState<{
    etapaId: string | number;
    estado: EtapaEstado;
    comentarios: string;
    evaluador: string;
  } | null>(null);

  const toggleExpand = (id: string | number) => {
    setExpandedStage((prev) => (prev === id ? null : id));
  };

  const openEdit = (stage: EvaluacionEtapa) => {
    setEditForm({
      etapaId: stage.id,
      estado: stage.estado,
      comentarios: stage.comentarios || '',
      evaluador: stage.evaluador || 'Equipo Kirikú',
    });
  };

  const saveEdit = () => {
    if (!editForm || !onUpdateStage) return;
    onUpdateStage({
      etapaId: editForm.etapaId,
      estado: editForm.estado,
      comentarios: editForm.comentarios,
      evaluador: editForm.evaluador,
    });
    setEditForm(null);
  };

  return (
    <div className="space-y-3">
      {/* Stepper horizontal bar for desktop */}
      <div className="hidden sm:grid grid-cols-5 gap-2 pb-3 border-b border-stone-200">
        {etapas.map((stage) => {
          const norm = normalizeState(stage.estado);
          const badge = getStatusBadge(stage.estado);
          const IconComponent = badge.icon;
          return (
            <div
              key={stage.id}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                norm === 'aprobado'
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : norm === 'en_revision'
                  ? 'border-blue-400 bg-blue-50/50 shadow-xs ring-1 ring-blue-300'
                  : norm === 'observado'
                  ? 'border-amber-300 bg-amber-50/50'
                  : norm === 'rechazado'
                  ? 'border-rose-300 bg-rose-50/50'
                  : 'border-stone-200 bg-stone-50/40 opacity-75'
              }`}
            >
              <div className="flex items-center justify-center mb-1">
                <IconComponent
                  className={`w-5 h-5 ${
                    norm === 'aprobado'
                      ? 'text-emerald-700'
                      : norm === 'en_revision'
                      ? 'text-blue-700 animate-pulse'
                      : norm === 'observado'
                      ? 'text-amber-700'
                      : norm === 'rechazado'
                      ? 'text-rose-700'
                      : 'text-stone-400'
                  }`}
                />
              </div>
              <div className="text-xs font-bold text-stone-900 truncate">
                {getStageMeta(stage.etapa).short}
              </div>
              <div
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  norm === 'aprobado'
                    ? 'text-emerald-700'
                    : norm === 'en_revision'
                    ? 'text-blue-700'
                    : norm === 'observado'
                    ? 'text-amber-700'
                    : norm === 'rechazado'
                    ? 'text-rose-700'
                    : 'text-stone-500'
                }`}
              >
                {badge.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed List View for each Stage */}
      <div className="space-y-2">
        {etapas.map((stage, idx) => {
          const norm = normalizeState(stage.estado);
          const badge = getStatusBadge(stage.estado);
          const BadgeIcon = badge.icon;
          const isExpanded = expandedStage === stage.id;

          return (
            <div
              key={stage.id}
              className="border border-stone-200 rounded-xl bg-white overflow-hidden transition-all"
            >
              <div
                onClick={() => toggleExpand(stage.id)}
                className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      norm === 'aprobado'
                        ? 'bg-emerald-100 text-emerald-800'
                        : norm === 'en_revision'
                        ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-300'
                        : norm === 'observado'
                        ? 'bg-amber-100 text-amber-800'
                        : norm === 'rechazado'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-stone-900 leading-tight">
                      {getStageMeta(stage.etapa).label}
                    </h4>
                    <p className="text-xs text-stone-500 line-clamp-1">
                      {getStageMeta(stage.etapa).description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${badge.bg}`}
                  >
                    <BadgeIcon className="w-3.5 h-3.5" />
                    {badge.text}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-stone-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-stone-400" />
                  )}
                </div>
              </div>

              {/* Expanded Detail Area */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 bg-stone-50 border-t border-stone-100 text-xs space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <span className="text-stone-400 block font-medium">Evaluador asignado:</span>
                      <span className="text-stone-800 font-medium">{stage.evaluador || 'Por asignar'}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block font-medium">Última actualización:</span>
                      <span className="text-stone-800 font-mono tabular-nums">
                        {stage.fecha_evaluacion
                          ? new Date(stage.fecha_evaluacion).toLocaleString('es-BO')
                          : 'Pendiente'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <span className="text-stone-400 block font-medium">Observaciones y Comentarios:</span>
                    <p className="text-stone-700 bg-white p-2.5 rounded-lg border border-stone-200 mt-1">
                      {stage.comentarios || 'Sin observaciones registradas todavía.'}
                    </p>
                  </div>

                  {/* Admin Quick Action Trigger */}
                  {interactive && (
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(stage);
                        }}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Calificar esta Etapa
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Admin Evaluation Modal / Form */}
      {editForm && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-bold text-stone-900 mb-1">
              Calificar Etapa de Evaluación
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Actualice el estado y documente observaciones conforme al protocolo de Kirikú.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Estado de la Etapa</label>
                <select
                  value={editForm.estado}
                  onChange={(e) =>
                    setEditForm({ ...editForm, estado: e.target.value as EtapaEstado })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="en_revision">En Revisión</option>
                  <option value="aprobado">Aprobada</option>
                  <option value="observado">Observada</option>
                  <option value="rechazado">Rechazada</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nombre del Evaluador</label>
                <input
                  type="text"
                  value={editForm.evaluador}
                  onChange={(e) => setEditForm({ ...editForm, evaluador: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  placeholder="Ej: Lic. María Flores (Psicología)"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Observaciones / Feedback</label>
                <textarea
                  value={editForm.comentarios}
                  onChange={(e) => setEditForm({ ...editForm, comentarios: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  placeholder="Escriba comentarios sobre el desempeño o motivos de la decisión..."
                ></textarea>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setEditForm(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shadow-sm cursor-pointer"
              >
                Guardar Calificación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EvaluationStepper;
