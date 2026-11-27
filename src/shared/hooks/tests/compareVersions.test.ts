import assert from 'node:assert/strict';

import { test } from 'vitest';

import { compareVersions } from '@/shared/hooks/useVersionCheck';

test('compareVersions orders CozyCLI releases', () => {
  assert.ok(compareVersions('1.37.10+cozy.2', '1.37.10+cozy.1') > 0);
  assert.ok(compareVersions('v1.37.10+cozy.1', '1.37.10+cozy.1') === 0);
  assert.ok(compareVersions('1.38.0+cozy.1', '1.37.10+cozy.9') > 0);
  assert.ok(compareVersions('1.37.10-cozy.3', '1.37.10+cozy.2') > 0);
  assert.ok(compareVersions('1.37.10+cozy.1', '1.37.10') > 0);
  assert.ok(compareVersions('1.2.3', '1.2.10') < 0);
});
