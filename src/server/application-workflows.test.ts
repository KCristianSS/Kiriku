import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWorkflowChanges } from './application-workflows';

test('KIR-90: registra un reenganche al mismo proyecto sin reiniciar etapas', () => {
  assert.deepEqual(resolveWorkflowChanges('reenganche'), {
    isReassigned: true,
    status: 'reenganche',
    restartTechnicalStage: false,
  });
});

test('KIR-90: reenganchar a otro proyecto inicia de nuevo solo la etapa técnica', () => {
  assert.deepEqual(resolveWorkflowChanges('reenganche', { projectChanged: true }), {
    isReassigned: true,
    status: 'reenganche',
    restartTechnicalStage: true,
  });
});

test('KIR-90: reasignar a otro proyecto no se etiqueta como reenganche', () => {
  assert.deepEqual(resolveWorkflowChanges('reasignacion', { projectChanged: true }), {
    isReassigned: true,
    status: 'reasignacion',
    restartTechnicalStage: false,
  });
});

test('KIR-90: desactivar el flujo conserva el estado y no reinicia la etapa técnica', () => {
  assert.deepEqual(resolveWorkflowChanges('reenganche', { enabled: false, projectChanged: true }), {
    isReassigned: false,
    status: undefined,
    restartTechnicalStage: false,
  });
});
