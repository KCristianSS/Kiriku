export const PERSONAL_CRITERIA = [
  { key: 'motivacion_servicio', label: 'Motivación y vocación de servicio' },
  { key: 'compromiso_responsabilidad', label: 'Compromiso y responsabilidad' },
  { key: 'comunicacion_interpersonal', label: 'Comunicación interpersonal' },
  { key: 'disponibilidad', label: 'Disponibilidad y constancia' },
  { key: 'madurez_autocuidado', label: 'Madurez y autocuidado' },
] as const;

export type PersonalCriterionKey = (typeof PERSONAL_CRITERIA)[number]['key'];
export type PersonalScores = Record<PersonalCriterionKey, number>;
export type PersonalDecision = 'aprobado' | 'observado' | 'rechazado';

export function validatePersonalScores(value: unknown): value is PersonalScores {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const scores = value as Record<string, unknown>;
  if (Object.keys(scores).length !== PERSONAL_CRITERIA.length) return false;
  return PERSONAL_CRITERIA.every(({ key }) => {
    const score = scores[key];
    return typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5;
  });
}

export function calculatePersonalAverage(scores: PersonalScores): number {
  const total = PERSONAL_CRITERIA.reduce((sum, { key }) => sum + scores[key], 0);
  return Math.round((total / PERSONAL_CRITERIA.length) * 100) / 100;
}

export function isPersonalDecision(value: unknown): value is PersonalDecision {
  return value === 'aprobado' || value === 'observado' || value === 'rechazado';
}
