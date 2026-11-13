import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCube, applyFrame, chainLuts, COLOR_SPACES, INTERPOLATION } from '../src/index.js';
import { identityCube, customLut } from './helpers/builders.js';

test('NaN/Infinity 像素与越界 domain 组合：输出始终有限且 alpha 原样', () => {
  const lut = customLut(
    5,
    ([r, g, b]) => [r, g, b],
    { domainMin: [0.1, 0.1, 0.1], domainMax: [0.9, 0.9, 0.9] },
  );
  const frame = Float64Array.of(
    NaN, -5, 2, 0.33,
    Infinity, 0.5, NaN, 0.7,
  );
  const out = applyFrame(lut, frame, {
    inputColorSpace: COLOR_SPACES.LINEAR,
    outputColorSpace: COLOR_SPACES.LINEAR,
  });
  assert.ok(out.slice(0, 3).every(Number.isFinite));
  assert.ok(out.slice(4, 7).every(Number.isFinite));
  assert.equal(out[3], 0.33);
  assert.equal(out[7], 0.7);
  assert.deepEqual([out[0], out[1], out[2]], lut.sample([0, 0, 1]));
});

test('两种插值对越界输入都钳制到同一角点', () => {
  const lut = parseCube(identityCube(6));
  const far = [10, -10, 10];
  const tri = lut.sample(far, INTERPOLATION.TRILINEAR);
  const tet = lut.sample(far, INTERPOLATION.TETRAHEDRAL);
  assert.deepEqual(tri, [1, 0, 1]);
  assert.deepEqual(tet, [1, 0, 1]);
});

test('串联中含越界输入时按每段 domain 独立钳制', () => {
  const lut = customLut(4, ([r, g, b]) => [r, g, b], { colorSpace: COLOR_SPACES.LINEAR });
  const chain = chainLuts([lut, null, lut]);
  const out = chain([5, -5, 0.5]);
  assert.deepEqual(out, [1, 0, 0.5]);
});

test('解析结果带 source 元信息可追溯 TITLE', () => {
  const lut = parseCube(identityCube(3, { title: 'unit-test-lut' }));
  assert.equal(lut.title, 'unit-test-lut');
  assert.deepEqual(lut.warnings, []);
});
