import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCube, applyFrame, INTERPOLATION } from '../src/index.js';
import { gammaStaircaseCube, identityCube } from './helpers/builders.js';

function buildFrame(pixelCount) {
  const frame = new Float64Array(pixelCount * 4);
  let seed = 7;
  for (let index = 0; index < frame.length; index += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    frame[index] = (seed % 1000) / 1000;
    frame[index + 1] = ((seed >> 3) % 1000) / 1000;
    frame[index + 2] = ((seed >> 7) % 1000) / 1000;
    frame[index + 3] = ((seed >> 11) % 256) / 255;
  }
  return frame;
}

test('同一输入两次映射逐位一致，且与像素处理顺序无关', () => {
  const lut = parseCube(gammaStaircaseCube(13, 2.2));
  const frame = buildFrame(257);

  const first = applyFrame(lut, frame);
  const second = applyFrame(lut, frame);
  assert.deepEqual(Array.from(first), Array.from(second));

  const reversed = new Float64Array(frame.length);
  const pixelCount = frame.length / 4;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    reversed.set(frame.subarray(pixel * 4, pixel * 4 + 4), (pixelCount - 1 - pixel) * 4);
  }
  const reversedOut = applyFrame(lut, reversed);
  const reversedBack = new Float64Array(reversedOut.length);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    reversedBack.set(
      reversedOut.subarray((pixelCount - 1 - pixel) * 4, (pixelCount - 1 - pixel) * 4 + 4),
      pixel * 4,
    );
  }
  assert.deepEqual(Array.from(reversedBack), Array.from(first));
});

test('三线性与四面体在网格点完全一致，在内部点存在可量化差异', () => {
  const lut = parseCube(gammaStaircaseCube(6, 2.2));
  const gridPoint = Float64Array.of(0.4, 0.4, 0.4, 1);
  const triGrid = applyFrame(lut, gridPoint, { interpolation: INTERPOLATION.TRILINEAR });
  const tetGrid = applyFrame(lut, gridPoint, { interpolation: INTERPOLATION.TETRAHEDRAL });
  assert.deepEqual(Array.from(triGrid), Array.from(tetGrid));

  const inner = Float64Array.of(0.17, 0.43, 0.81, 1);
  const tri = applyFrame(lut, inner, { interpolation: INTERPOLATION.TRILINEAR });
  const tet = applyFrame(lut, inner, { interpolation: INTERPOLATION.TETRAHEDRAL });
  const diff = Math.max(
    Math.abs(tri[0] - tet[0]),
    Math.abs(tri[1] - tet[1]),
    Math.abs(tri[2] - tet[2]),
  );
  assert.ok(diff > 0, '非线性 LUT 内部点上两种插值应存在差异');
});

test('identity LUT 确定性：任意像素重复处理结果不变', () => {
  const lut = parseCube(identityCube(9));
  const frame = buildFrame(64);
  const once = applyFrame(lut, frame);
  const twice = applyFrame(lut, applyFrame(lut, Float64Array.from(frame)));
  assert.deepEqual(Array.from(once), Array.from(twice));
});
