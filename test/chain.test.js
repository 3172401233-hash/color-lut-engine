import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCube,
  chainLuts,
  bakeChain,
  COLOR_SPACES,
  INTERPOLATION,
  Lut3D,
} from '../src/index.js';
import { channelSwapCube, customLut, identityCube } from './helpers/builders.js';

const EPS = 1e-12;

test('两个 LUT 串联：通道交换两次后在线性空间恒等', () => {
  const swapA = parseCube(channelSwapCube(8, [2, 1, 0]));
  const swapB = parseCube(channelSwapCube(16, [2, 1, 0]));
  const chain = chainLuts([swapA, swapB]);
  const input = [0.2, 0.4, 0.8];
  const out = chain(input);
  assert.ok(Math.abs(out[0] - input[0]) < 1e-12);
  assert.ok(Math.abs(out[1] - input[1]) < 1e-12);
  assert.ok(Math.abs(out[2] - input[2]) < 1e-12);
});

test('不同尺寸 LUT 串联：各自独立插值，结果可手算复核', () => {
  const redScale = customLut(4, ([r, g, b]) => [r * 0.5, g, b], { colorSpace: COLOR_SPACES.LINEAR });
  const blueScale = customLut(9, ([r, g, b]) => [r, g, b * 2], { colorSpace: COLOR_SPACES.LINEAR });
  const chain = chainLuts([redScale, blueScale]);
  const out = chain([0.4, 0.5, 0.3]);
  assert.ok(Math.abs(out[0] - 0.2) < EPS);
  assert.ok(Math.abs(out[1] - 0.5) < EPS);
  assert.ok(Math.abs(out[2] - 0.6) < EPS);
});

test('空 LUT（null）在串联中被跳过；全空串联为恒等函数', () => {
  const linearLut = customLut(4, ([r, g, b]) => [r, g, b], { colorSpace: COLOR_SPACES.LINEAR });
  const chainWithHoles = chainLuts([null, linearLut, undefined, null]);
  const input = [0.3, 0.6, 0.9];
  const out = chainWithHoles(input);
  input.forEach((value, index) => assert.ok(Math.abs(out[index] - value) < EPS));

  const emptyChain = chainLuts([null, undefined]);
  const emptyOut = emptyChain(input);
  input.forEach((value, index) => assert.ok(Math.abs(emptyOut[index] - value) < EPS));
});

test('bakeChain 烘焙出与串联函数一致的新 Lut3D', () => {
  const redScale = customLut(4, ([r, g, b]) => [r * 0.5, g, b], { colorSpace: COLOR_SPACES.LINEAR });
  const baked = bakeChain([redScale, null], { size: 8, colorSpace: COLOR_SPACES.LINEAR });
  assert.ok(baked instanceof Lut3D);
  assert.equal(baked.size, 8);
  const chain = chainLuts([redScale]);
  const probe = [0.37, 0.51, 0.83];
  const expected = chain(probe);
  const sampled = baked.sample(probe, INTERPOLATION.TRILINEAR);
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(Math.abs(sampled[channel] - expected[channel]) < 1e-10);
  }
});

test('串联接受 sRGB 与 linear 混合的 LUT', () => {
  const srgbLut = parseCube(channelSwapCube(6, [1, 0, 2]));
  const linearLut = customLut(5, ([r, g, b]) => [r, g, b], { colorSpace: COLOR_SPACES.LINEAR });
  const chain = chainLuts([srgbLut, linearLut], { interpolation: INTERPOLATION.TETRAHEDRAL });
  const out = chain([0.25, 0.75, 0.5]);
  const expectedFirst = [0.75, 0.25, 0.5];
  assert.equal(out.length, 3);
  assert.ok(Math.abs(out[0] - expectedFirst[0]) < 1e-12);
  assert.ok(Math.abs(out[1] - expectedFirst[1]) < 1e-12);
  assert.ok(Math.abs(out[2] - expectedFirst[2]) < 1e-12);
});

test('串联非法参数抛错', () => {
  assert.throws(() => chainLuts(null));
  assert.throws(() => chainLuts([], { interpolation: 'nearest' }));
  assert.throws(() => bakeChain([], { size: 1 }));
});

test('identity 串联烘焙仍为 identity', () => {
  const identity = parseCube(identityCube(6));
  const baked = bakeChain([identity, null, identity], { size: 12 });
  const point = [0.33, 0.61, 0.17];
  const out = baked.sample(point);
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(Math.abs(out[channel] - point[channel]) < 1e-12);
  }
});
