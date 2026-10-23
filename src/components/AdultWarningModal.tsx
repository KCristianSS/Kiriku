import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Check,
  X,
  Info,
  Calendar,
  Building2,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  FileCheck2,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  projectTitle?: string;
  projectLocation?: string;
  projectOrg?: string;
  initialBirthDate?: string;
  onConfirm?: (payload?: { confirmedDate?: string }) => void;
  onClose?: () => void;
}

export const AdultWarningModal: React.FC<Props> = ({
  isOpen,
  projectTitle = '',
  projectLocation = '',
  projectOrg = '',
  initialBirthDate = '',
  onConfirm,
  onClose,
}) => {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [testBirthDate, setTestBirthDate] = useState(initialBirthDate);

  useEffect(() => {
    if (initialBirthDate) {
      setTestBirthDate(initialBirthDate);
    }
  }, [initialBirthDate]);

  useEffect(() => {
    if (isOpen) {
      setAcceptedTerms(false);
      if (initialBirthDate) {
        setTestBirthDate(initialBirthDate);
      }
    }
  }, [isOpen, initialBirthDate]);

  // Calculated age in modal
  const modalCalculatedAge = useMemo<number | null>(() => {
    if (!testBirthDate) return null;
    const birth = new Date(testBirthDate);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }, [testBirthDate]);

  const isUnderage = useMemo(() => {
    if (modalCalculatedAge === null) return false;
    return modalCalculatedAge < 18;
  }, [modalCalculatedAge]);

  const canConfirm = useMemo(() => {
    if (!acceptedTerms) return false;
    if (isUnderage) return false;
    return true;
  }, [acceptedTerms, isUnderage]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (canConfirm && onConfirm) {
      onConfirm({ confirmedDate: testBirthDate });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-headline"
    >
      <div className="relative bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-stone-200 overflow-hidden">
        {/* Top color banner accent (Kirikú Brand Stripe) */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

        {/* Close button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-5 right-5 text-stone-400 hover:text-stone-700 p-1.5 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon & Title Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>KIR-98: Requisito Excluyente</span>
            </div>
            <h3 id="modal-headline" className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight">
              Aviso de Mayoría de Edad (+18 Años)
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
              Verificación legal y de seguridad previa a la postulación de voluntariado.
            </p>
          </div>
        </div>

        {/* Project context card */}
        {projectTitle && (
          <div className="bg-gradient-to-br from-stone-50 to-[#E8F6F8]/30 rounded-2xl p-4 border border-stone-200 mb-5 text-xs text-stone-600">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-bold text-stone-900 text-sm truncate">{projectTitle}</span>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0">
                +18 Años Obligatorio
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-stone-500 mt-1">
              {projectOrg && (
                <span className="flex items-center gap-1 font-medium text-[#1E7B85]">
                  <Building2 className="w-3.5 h-3.5" />
                  {projectOrg}
                </span>
              )}
              {projectLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-stone-400" />
                  {projectLocation}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Conditions explanation boxes */}
        <div className="space-y-2.5 text-xs text-stone-700 mb-5">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
            <Info className="w-4 h-4 text-[#289EAB] shrink-0 mt-0.5" />
            <div>
              <strong className="text-stone-900 block mb-0.5">Marco de Seguridad y Voluntariado en Campo:</strong>
              <span>
                Este proyecto contempla actividades de campo, logística o interacción comunitaria que, por normativa de prevención y cobertura de seguro voluntario, exigen tener 18 años cumplidos.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
            <FileCheck2 className="w-4 h-4 text-[#F58F38] shrink-0 mt-0.5" />
            <div>
              <strong className="text-stone-900 block mb-0.5">Verificación de Cédula de Identidad (CI):</strong>
              <span>
                La edad declarada se contrastará formalmente con tu CI en la Etapa 1 (Admisión Inicial). Postulaciones de menores de edad serán rechazadas automáticamente por el sistema.
              </span>
            </div>
          </div>
        </div>

        {/* Quick Pre-Check Tool (KIR-99) inside modal */}
        <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200 mb-5">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="modal-birthdate" className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-700" />
              <span>Verifica tu edad antes de continuar (Opcional):</span>
            </label>
            {modalCalculatedAge !== null && (
              <span className="font-mono text-xs font-bold text-stone-800">
                {modalCalculatedAge} años
              </span>
            )}
          </div>

          <input
            id="modal-birthdate"
            value={testBirthDate}
            onChange={(e) => setTestBirthDate(e.target.value)}
            type="date"
            className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#289EAB] font-mono"
          />

          {modalCalculatedAge !== null && (
            <div className="mt-2 text-xs">
              {isUnderage ? (
                <div className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-200 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>Edad calculada: {modalCalculatedAge} años. No cumples el requisito mínimo de +18 para este proyecto.</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>Edad calculada: {modalCalculatedAge} años. Cumples con la mayoría de edad habilitada.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sworn statement checkbox */}
        <label
          className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer mb-6 ${
            acceptedTerms
              ? 'border-[#289EAB] bg-[#E8F6F8]/40 text-stone-900'
              : 'border-stone-200 hover:bg-stone-50 text-stone-700'
          }`}
        >
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            disabled={isUnderage}
            className="mt-1 w-4 h-4 rounded text-[#289EAB] border-stone-300 focus:ring-[#289EAB] cursor-pointer disabled:cursor-not-allowed"
          />
          <span className="text-xs font-medium leading-relaxed">
            <strong className="text-stone-900">Declaración Jurada:</strong> Confirmo bajo juramento que tengo <strong>18 años o más</strong> a la fecha de inicio del proyecto y acepto presentar mi documento de identidad en la verificación inicial.
          </span>
        </label>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar / Ver Otros Proyectos
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`w-full sm:w-auto px-5 py-2.5 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
              canConfirm
                ? 'bg-[#289EAB] hover:bg-[#1E7B85] text-white active:scale-98 shadow-sm'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>Continuar a la Postulación</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdultWarningModal;
