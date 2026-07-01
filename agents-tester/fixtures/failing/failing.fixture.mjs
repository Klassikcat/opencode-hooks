import test from 'node:test';
import assert from 'node:assert/strict';

test('intentional fixture failure', () => {
  assert.equal(1, 2);
});
