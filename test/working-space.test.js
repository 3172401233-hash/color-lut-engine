import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCube,
  applyFrame,
  COLOR_SPACES,
  INTERPOLATION,
  srgbToLinear,
  linearToSrgb,
} from '../src/index.js';
import { gammaStaircaseCube, customLut } from './helpers/builders.js';

test('lutWorkingSpace=linear 时 sRGB LUT 数据先转线性再采样', () => {
  const lut = parseCube(gammaStaircaseCube(17, 2.2));
  const frame = Float64Array.of(0.5, 0.5, 0.5, 1);
  const out = applyFrame(lut, frame, {
    inputColorSpace: COLOR_SPACES.SRGB,
    outputColorSpace: COLOR_SPACES.LINEAR,
    lutWorkingSpace: COLOR_SPACES.LINEAR,
  });
  const linearSampleInput = srgbToLinear(0.5);
  const srgbLutValue = Math.pow(linearSampleInput, 2.2);
  const expectedLinear = srgbToLinear(srgbLutValue);
  assert.ok(Math.abs(out[0] - expectedLinear) < 1e-3);
  assert.equal(out[3], 1);
});

test('linear LUT 配合 sRGB 帧输入，输出 sRGB', () => {
  const size = 17;
  const lut = customLut(size, ([r, g, b]) => [r * r, g * g, b * b], {
    colorSpace: COLOR_SPACES.LINEAR,
  });
  const gridLinear = 1 / (size - 1);
  const srgbAtGrid = linearToSrgb(gridLinear);
  const frame = Float64Array.of(srgbAtGrid, srgbAtGrid, srgbAtGrid, 1);
  const out = applyFrame(lut, frame, {
    inputColorSpace: COLOR_SPACES.SRGB,
    outputColorSpace: COLOR_SPACES.SRGB,
  });
  const expectedSrgb = linearToSrgb(gridLinear * gridLinear);
  assert.ok(Math.abs(out[0] - expectedSrgb) < 1e-12);
  assert.ok(Math.abs(out[1] - expectedSrgb) < 1e-12);
  assert.equal(out[3], 1);
});

test('sRGB LUT 默认在 sRGB 工作空间采样，与直接 sample 一致', () => {
  const lut = parseCube(gammaStaircaseCube(9, 1.8));
  const frame = Float64Array.of(0.35, 0.35, 0.35, 0.9);
  const out = applyFrame(lut, frame);
  const direct = lut.sample([0.35, 0.35, 0.35], INTERPOLATION.TRILINEAR);
  assert.ok(Math.abs(out[0] - direct[0]) < 1e-14);
  assert.equal(out[3], 0.9);
});

test('非法 lutWorkingSpace 抛参数错误', () => {
  const lut = parseCube(gammaStaircaseCube(4, 2));
  assert.throws(() => applyFrame(lut, Float64Array.of(0.5, 0.5, 0.5, 1), { lutWorkingSpace: 'xyz' }));
});

test('线性输出再转回 sRGB 的往返与线性域直接结果吻合', () => {
  const lut = customLut(9, ([r, g, b]) => [r, g, b], { colorSpace: COLOR_SPACES.LINEAR });
  const linearValue = 0.4;
  const frame = Float64Array.of(linearToSrgb(linearValue), linearToSrgb(linearValue), linearToSrgb(linearValue), 1);
  const out = applyFrame(lut, frame, {
    inputColorSpace: COLOR_SPACES.SRGB,
    outputColorSpace: COLOR_SPACES.SRGB,
  });
  assert.ok(Math.abs(out[0] - linearToSrgb(linearValue)) < 1e-12);
});
