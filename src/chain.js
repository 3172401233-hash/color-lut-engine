import { Lut3D, INTERPOLATION } from './lut3d.js';
import { LutArgumentError } from './errors.js';
import { COLOR_SPACES, toLinear, fromLinear } from './colorspace.js';

function normalizeLutList(luts) {
  if (!Array.isArray(luts)) {
    throw new LutArgumentError('chainLuts 需要一个 Lut3D/null 数组');
  }
  return luts.filter((lut) => lut !== null && lut !== undefined);
}

export function chainLuts(luts, options = {}) {
  const { interpolation = INTERPOLATION.TRILINEAR } = options;
  if (![INTERPOLATION.TRILINEAR, INTERPOLATION.TETRAHEDRAL].includes(interpolation)) {
    throw new LutArgumentError(`不支持的插值方式: ${interpolation}`);
  }
  const activeLuts = normalizeLutList(luts);

  if (activeLuts.length === 0) {
    return (linearRgb) => linearRgb.slice();
  }

  return (linearRgb) => {
    let current = linearRgb.slice();
    for (const lut of activeLuts) {
      let inputRgb = current;
      if (lut.colorSpace === COLOR_SPACES.SRGB) {
        inputRgb = current.map((value) => fromLinear(value, COLOR_SPACES.SRGB));
      }
      const sampled = lut.sample(inputRgb, interpolation);
      current = lut.colorSpace === COLOR_SPACES.SRGB
        ? sampled.map((value) => toLinear(value, COLOR_SPACES.SRGB))
        : sampled;
    }
    return current;
  };
}

export function bakeChain(luts, options = {}) {
  const {
    size = 33,
    interpolation = INTERPOLATION.TRILINEAR,
    colorSpace = COLOR_SPACES.SRGB,
  } = options;
  if (!Number.isInteger(size) || size < 2) {
    throw new LutArgumentError('烘焙尺寸必须是 >= 2 的整数');
  }
  if (![COLOR_SPACES.SRGB, COLOR_SPACES.LINEAR].includes(colorSpace)) {
    throw new LutArgumentError(`不支持的色彩空间: ${colorSpace}`);
  }

  const chain = chainLuts(luts, { interpolation });
  const data = new Float64Array(size ** 3 * 3);

  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const normalized = [ix / (size - 1), iy / (size - 1), iz / (size - 1)];
        const linearRgb = normalized.map((value) => toLinear(value, colorSpace));
        const chained = chain(linearRgb);
        const outRgb = chained.map((value) => fromLinear(value, colorSpace));
        const base = ((iz * size + iy) * size + ix) * 3;
        data[base] = outRgb[0];
        data[base + 1] = outRgb[1];
        data[base + 2] = outRgb[2];
      }
    }
  }

  return new Lut3D({ size, data, colorSpace });
}
