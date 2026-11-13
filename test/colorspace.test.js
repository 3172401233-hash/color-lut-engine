import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_SPACES, srgbToLinear, linearToSrgb, parseCube, applyFrame, mapPixel, INTERPOLATION } from '../src/index.js';
import { identityCube, channelSwapCube, gammaStaircaseCube } from './helpers/builders.js';

const EPS = 1e-12;

test('sRGB 传递函数分段公式与往返一致', () => {
  assert.equal(srgbToLinear(0), 0);
  assert.ok(Math.abs(srgbToLinear(0.04) - 0.04 / 12.92) < EPS);
  assert.ok(Math.abs(srgbToLinear(0.5) - Math.pow((0.5 + 0.055) / 1.055, 2.4)) < 1e-15);
  for (const value of [0, 0.01, 0.04045, 0.2, 0.5, 0.9, 1]) {
    assert.ok(Math.abs(linearToSrgb(srgbToLinear(value)) - value) < 1e-14);
  }
  assert.equal(linearToSrgb(0), 0);
});

test('identity LUT 映射后 RGB 恒等且 alpha 原样保留', () => {
  const lut = parseCube(identityCube(8));
  const frame = Float64Array.of(0.1, 0.2, 0.3, 0.4, 0.7, 0.8, 0.9, 0.25);
  const out = applyFrame(lut, frame);
  assert.deepEqual(Array.from(out), [0.1, 0.2, 0.3, 0.4, 0.7, 0.8, 0.9, 0.25]);
  assert.notStrictEqual(out, frame);
});

test('inPlace 模式复用同一缓冲区，默认返回新缓冲区', () => {
  const lut = parseCube(identityCube(4));
  const frame = Float64Array.of(0.1, 0.2, 0.3, 0.9);
  const out = applyFrame(lut, frame, { inPlace: true });
  assert.strictEqual(out, frame);
  const copy = applyFrame(lut, frame);
  assert.notStrictEqual(copy, frame);
});

test('通道交换 LUT：RGBA 帧批量映射，alpha 不变', () => {
  const lut = parseCube(channelSwapCube(8, [2, 1, 0]));
  const frame = Uint8ClampedArray.of(255, 128, 0, 200, 10, 20, 30, 40);
  const out = applyFrame(lut, frame, { valueRange: 255 });
  assert.ok(out instanceof Uint8ClampedArray);
  const expected = [0, 128, 255, 200, 30, 20, 10, 40];
  Array.from(out).forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= 1, `channel ${index}: ${value} vs ${expected[index]}`);
  });
  assert.equal(out[3], 200);
  assert.equal(out[7], 40);
});

test('线性空间输入输出与 LUT 空间对齐：linear 模式 gamma LUT 直接作用在线性值', () => {
  const lut = parseCube(gammaStaircaseCube(33, 2.0), { });
  Object.assign(lut, { colorSpace: COLOR_SPACES.LINEAR });
  const frame = Float64Array.of(0.25, 0.25, 0.25, 1);
  const out = applyFrame(lut, frame, {
    inputColorSpace: COLOR_SPACES.LINEAR,
    outputColorSpace: COLOR_SPACES.LINEAR,
  });
  assert.ok(Math.abs(out[0] - 0.0625) < 1e-10);
  assert.equal(out[3], 1);
});

test('sRGB LUT + sRGB 帧：内部经过线性中转，结果与直接采样在转换误差内', () => {
  const lut = parseCube(gammaStaircaseCube(17, 2.2));
  const frame = Float64Array.of(0.5, 0.5, 0.5, 0.7);
  const out = applyFrame(lut, frame);
  const direct = lut.sample([0.5, 0.5, 0.5]);
  assert.ok(Math.abs(out[0] - direct[0]) < 1e-14);
  assert.equal(out[3], 0.7);
});

test('NaN / Infinity 像素分量被消毒为 0，alpha 原样保留', () => {
  const lut = parseCube(identityCube(4));
  const frame = Float64Array.of(NaN, 0.4, Infinity, 0.5);
  const out = applyFrame(lut, frame);
  assert.deepEqual(Array.from(out), [0, 0.4, 0, 0.5]);
});

test('mapPixel 单像素便捷接口', () => {
  const lut = parseCube(channelSwapCube(8, [1, 0, 2]));
  const out = mapPixel(lut, [0.2, 0.6, 0.9, 0.33]);
  assert.ok(Math.abs(out[0] - 0.6) < 1e-14);
  assert.ok(Math.abs(out[1] - 0.2) < 1e-14);
  assert.ok(Math.abs(out[2] - 0.9) < 1e-14);
  assert.equal(out[3], 0.33);
});

test('帧长度非 4 倍数或缺少 LUT 抛参数错误', () => {
  const lut = parseCube(identityCube(2));
  assert.throws(() => applyFrame(lut, Float64Array.of(1, 2, 3)));
  assert.throws(() => applyFrame(null, Float64Array.of(1, 2, 3, 4)));
  assert.throws(() => applyFrame(lut, Float64Array.of(1, 2, 3, 4), { inputColorSpace: 'lab' }));
});

test('两种插值在帧接口上都可用且 tetra 保持 alpha', () => {
  const lut = parseCube(gammaStaircaseCube(8, 1.8));
  const frame = Float64Array.of(0.3, 0.6, 0.9, 0.42);
  const tri = applyFrame(lut, frame, { interpolation: INTERPOLATION.TRILINEAR });
  const tet = applyFrame(lut, frame, { interpolation: INTERPOLATION.TETRAHEDRAL });
  assert.equal(tri[3], 0.42);
  assert.equal(tet[3], 0.42);
  assert.ok(tri.slice(0, 3).every(Number.isFinite));
  assert.ok(tet.slice(0, 3).every(Number.isFinite));
});
