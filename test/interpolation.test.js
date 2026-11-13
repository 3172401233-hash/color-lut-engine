import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERPOLATION } from '../src/index.js';
import { cornerValueLut2, customLut, identityCube } from './helpers/builders.js';
import { parseCube } from '../src/index.js';

const EPS = 1e-12;

function assertClose(actual, expected, epsilon = EPS) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= epsilon,
      `channel ${i}: ${actual[i]} !~ ${expected[i]}`,
    );
  }
}

test('网格采样点：两种插值都精确命中角点', () => {
  const { lut, cornerValues } = cornerValueLut2();
  for (const [key, expected] of Object.entries(cornerValues)) {
    const [ix, iy, iz] = key.split(',').map(Number);
    const input = [ix, iy, iz];
    assertClose(lut.sample(input, INTERPOLATION.TRILINEAR), expected);
    assertClose(lut.sample(input, INTERPOLATION.TETRAHEDRAL), expected);
  }
});

test('三线性内部点：与手算权重一致', () => {
  const { lut } = cornerValueLut2();
  const fx = 0.2;
  const fy = 0.5;
  const fz = 0.3;
  const result = lut.sample([fx, fy, fz], INTERPOLATION.TRILINEAR);
  const expectedR = 0.1 * 0.8 * 0.5 * 0.7
    + 0.2 * 0.2 * 0.5 * 0.7
    + 0.3 * 0.8 * 0.5 * 0.7
    + 0.4 * 0.2 * 0.5 * 0.7
    + 0.5 * 0.8 * 0.5 * 0.3
    + 0.6 * 0.2 * 0.5 * 0.3
    + 0.7 * 0.8 * 0.5 * 0.3
    + 0.8 * 0.2 * 0.5 * 0.3;
  assertClose(result, [expectedR, expectedR + 0.01, expectedR + 0.02]);
});

test('四面体内部点：fx>fz>fy 分区，与手算重心权重一致', () => {
  const { lut } = cornerValueLut2();
  const fx = 0.7;
  const fy = 0.2;
  const fz = 0.5;
  assert.ok(fx > fz && fz > fy);
  const result = lut.sample([fx, fy, fz], INTERPOLATION.TETRAHEDRAL);
  const weightedCorners = [
    { weight: 0.3, corner: [0.1, 0.11, 0.12] },
    { weight: 0.2, corner: [0.2, 0.21, 0.22] },
    { weight: 0.3, corner: [0.6, 0.61, 0.62] },
    { weight: 0.2, corner: [0.8, 0.81, 0.82] },
  ];
  const expected = [0, 0, 0];
  weightedCorners.forEach(({ weight, corner }) => {
    corner.forEach((value, channel) => {
      expected[channel] += weight * value;
    });
  });
  assertClose(result, expected);
});

test('四面体六条分区边界两侧结果连续（无网格边断裂）', () => {
  const { lut } = cornerValueLut2();
  const identity = parseCube(identityCube(8));
  const delta = 1e-9;

  for (let index = 0; index < 40; index += 1) {
    const point = [
      ((index * 37) % 100) / 100,
      ((index * 53) % 100) / 100,
      ((index * 71) % 100) / 100,
    ];
    const perturbed = point.map((value, axis) => (
      axis === index % 3 ? Math.min(1, value + delta) : Math.max(0, value - delta)
    ));
    const a = identity.sample(point, INTERPOLATION.TETRAHEDRAL);
    const b = identity.sample(perturbed, INTERPOLATION.TETRAHEDRAL);
    assertClose(a, point, 1e-10);
    assertClose(b, perturbed, 1e-10);
  }

  const boundaries = [
    [[0.3, 0.3, 0.1], [0.3 + delta, 0.3 - delta, 0.1]],
    [[0.3, 0.3, 0.1], [0.3 - delta, 0.3 + delta, 0.1]],
    [[0.7, 0.3, 0.7], [0.7 + delta, 0.3, 0.7 - delta]],
    [[0.7, 0.3, 0.7], [0.7 - delta, 0.3, 0.7 + delta]],
    [[0.3, 0.7, 0.7], [0.3 + delta, 0.7, 0.7 - delta]],
    [[0.3, 0.7, 0.7], [0.3 - delta, 0.7, 0.7 + delta]],
  ];
  for (const [left, right] of boundaries) {
    const a = lut.sample(left, INTERPOLATION.TETRAHEDRAL);
    const b = lut.sample(right, INTERPOLATION.TETRAHEDRAL);
    assertClose(a, b, 1e-6);
  }
});

test('identity LUT 在任意内部点恒等，两种插值结果相同', () => {
  const lut = parseCube(identityCube(8));
  const point = [0.17, 0.43, 0.81];
  assertClose(lut.sample(point, INTERPOLATION.TRILINEAR), point);
  assertClose(lut.sample(point, INTERPOLATION.TETRAHEDRAL), point);
});

test('边界面：超出 domain 的输入按 clamp-to-edge 处理', () => {
  const lut = customLut(3, ([r, g, b]) => [r, g, b]);
  const corner = lut.sample([1, 1, 1]);
  assertClose(lut.sample([1.5, 2.0, 5.0]), corner);
  assertClose(lut.sample([-1, -0.2, -9]), [0, 0, 0]);
  assertClose(lut.sample([0.5, -9, 0.5]), lut.sample([0.5, 0, 0.5]));
});

test('自定义 domain 下的映射坐标正确', () => {
  const lut = customLut(
    3,
    ([r, g, b]) => [r, g, b],
    { domainMin: [-0.5, -0.5, -0.5], domainMax: [2, 2, 2] },
  );
  assertClose(lut.sample([-0.5, -0.5, -0.5]), [0, 0, 0]);
  assertClose(lut.sample([2, 2, 2]), [1, 1, 1]);
  assertClose(lut.sample([0.75, 0.75, 0.75]), [0.5, 0.5, 0.5]);
});

test('含 NaN 的输入被钳制为 0 通道处理，不产生 NaN 输出', () => {
  const lut = parseCube(identityCube(4));
  const result = lut.sample([NaN, 0.5, Infinity]);
  assert.ok(result.every(Number.isFinite));
  assertClose(result, lut.sample([0, 0.5, 1]));
});

test('非法插值方式抛 LutArgumentError', () => {
  const lut = parseCube(identityCube(2));
  assert.throws(() => lut.sample([0.5, 0.5, 0.5], 'cubic'));
});
