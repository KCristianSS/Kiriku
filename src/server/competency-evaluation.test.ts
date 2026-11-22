import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCompetencyAverage,
  COMPETENCY_CRITERIA,
  isCompetencyDecision,
  validateCompetencyScores,
  type CompetencyScores,
} from './competency-evaluation';

const validScores: CompetencyScores = {
  trabajo_equipo: 5,
  comunicacion: 4,
  liderazgo: 3,
  resolucion_problemas: 2,
  empatia_adaptabilidad: 1,
};

test('define cinco criterios de evaluación por competencias', () => {
  assert.equal(COMPETENCY_CRITERIA.length, 5);
  assert.deepEqual(COMPETENCY_CRITERIA.map(({ key }) => key), [
    'trabajo_equipo',
    'comunicacion',
    'liderazgo',
    'resolucion_problemas',
    'empatia_adaptabilidad',
  ]);
});

test('acepta puntuaciones enteras del 1 al 5 para todos los criterios', () => {
  assert.equal(validateCompetencyScores(validScores), true);
  assert.equal(validateCompetencyScores({ ...validScores, comunicacion: 0 }), false);
  assert.equal(validateCompetencyScores({ ...validScores, liderazgo: 6 }), false);
  assert.equal(validateCompetencyScores({ ...validScores, liderazgo: 3.5 }), false);
  assert.equal(validateCompetencyScores({ ...validScores, criterio_extra: 4 }), false);
  const { trabajo_equipo: _removed, ...missingCriterion } = validScores;
  assert.equal(validateCompetencyScores(missingCriterion), false);
  assert.equal(validateCompetencyScores(null), false);
});

test('calcula el promedio de la rúbrica con dos decimales', () => {
  assert.equal(calculateCompetencyAverage(validScores), 3);
  assert.equal(calculateCompetencyAverage({
    trabajo_equipo: 5,
    comunicacion: 5,
    liderazgo: 4,
    resolucion_problemas: 4,
    empatia_adaptabilidad: 3,
  }), 4.2);
});

test('solo admite decisiones válidas de evaluación', () => {
  assert.equal(isCompetencyDecision('aprobado'), true);
  assert.equal(isCompetencyDecision('observado'), true);
  assert.equal(isCompetencyDecision('rechazado'), true);
  assert.equal(isCompetencyDecision('pendiente'), false);
});
