import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePersonalAverage,
  isPersonalDecision,
  PERSONAL_CRITERIA,
  validatePersonalScores,
  type PersonalScores,
} from './personal-evaluation';

const validScores: PersonalScores = {
  motivacion_servicio: 5,
  compromiso_responsabilidad: 4,
  comunicacion_interpersonal: 3,
  disponibilidad: 2,
  madurez_autocuidado: 1,
};

test('define cinco criterios para la entrevista personal', () => {
  assert.equal(PERSONAL_CRITERIA.length, 5);
  assert.deepEqual(PERSONAL_CRITERIA.map(({ key }) => key), [
    'motivacion_servicio',
    'compromiso_responsabilidad',
    'comunicacion_interpersonal',
    'disponibilidad',
    'madurez_autocuidado',
  ]);
});

test('valida puntuaciones enteras de 1 a 5 y exige los cinco criterios', () => {
  assert.equal(validatePersonalScores(validScores), true);
  assert.equal(validatePersonalScores({ ...validScores, disponibilidad: 0 }), false);
  assert.equal(validatePersonalScores({ ...validScores, disponibilidad: 6 }), false);
  assert.equal(validatePersonalScores({ ...validScores, disponibilidad: 2.5 }), false);
  assert.equal(validatePersonalScores({ ...validScores, extra: 3 }), false);
  const { disponibilidad: _removed, ...missing } = validScores;
  assert.equal(validatePersonalScores(missing), false);
  assert.equal(validatePersonalScores(null), false);
});

test('calcula el promedio de entrevista con dos decimales', () => {
  assert.equal(calculatePersonalAverage(validScores), 3);
  assert.equal(calculatePersonalAverage({
    motivacion_servicio: 5,
    compromiso_responsabilidad: 5,
    comunicacion_interpersonal: 4,
    disponibilidad: 4,
    madurez_autocuidado: 3,
  }), 4.2);
});

test('admite solo las decisiones de aprobación, observación o rechazo', () => {
  assert.equal(isPersonalDecision('aprobado'), true);
  assert.equal(isPersonalDecision('observado'), true);
  assert.equal(isPersonalDecision('rechazado'), true);
  assert.equal(isPersonalDecision('pendiente'), false);
});
