import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPermission } from './permissions';

test('permite acciones solo con usuario autenticado y permiso asignado', () => {
  assert.equal(hasPermission('user-1', ['projects.review'], 'projects.review'), true);
  assert.equal(hasPermission('user-1', ['applications.read'], 'projects.review'), false);
  assert.equal(hasPermission(undefined, ['projects.review'], 'projects.review'), false);
  assert.equal(hasPermission('user-1', undefined, 'projects.review'), false);
});
