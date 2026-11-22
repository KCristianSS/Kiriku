export const COMPETENCY_CRITERIA = [
  { key: 'trabajo_equipo', label: 'Trabajo en equipo' },
  { key: 'comunicacion', label: 'Comunicación' },
  { key: 'liderazgo', label: 'Liderazgo e iniciativa' },
  { key: 'resolucion_problemas', label: 'Resolución de problemas' },
  { key: 'empatia_adaptabilidad', label: 'Empatía y adaptabilidad' },
] as const;

export type CompetencyCriterionKey = (typeof COMPETENCY_CRITERIA)[number]['key'];
export type CompetencyScores = Record<CompetencyCriterionKey, number>;
export type CompetencyDecision = 'aprobado' | 'observado' | 'rechazado';

export function validateCompetencyScores(value: unknown): value is CompetencyScores {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const scores = value as Record<string, unknown>;
  if (Object.keys(scores).length !== COMPETENCY_CRITERIA.length) return false;
  return COMPETENCY_CRITERIA.every(({ key }) => {
    const score = scores[key];
    return typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5;
  });
}

export function calculateCompetencyAverage(scores: CompetencyScores): number {
  const total = COMPETENCY_CRITERIA.reduce((sum, { key }) => sum + scores[key], 0);
  return Math.round((total / COMPETENCY_CRITERIA.length) * 100) / 100;
}

export function isCompetencyDecision(value: unknown): value is CompetencyDecision {
  return value === 'aprobado' || value === 'observado' || value === 'rechazado';
}
