import { Lut3D } from '../../src/lut3d.js';

function format(value) {
  if (Object.is(value, -0)) return '0';
  return String(value);
}

export function identityCube(size, options = {}) {
  const { title = null, domainMin = null, domainMax = null } = options;
  const lines = [];
  if (title !== null) {
    lines.push(`TITLE "${title}"`);
  }
  if (domainMin !== null) {
    lines.push(`DOMAIN_MIN ${domainMin.join(' ')}`);
  }
  if (domainMax !== null) {
    lines.push(`DOMAIN_MAX ${domainMax.join(' ')}`);
  }
  lines.push(`LUT_3D_SIZE ${size}`);
  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        lines.push([ix, iy, iz].map((index) => format(index / (size - 1))).join(' '));
      }
    }
  }
  return lines.join('\n');
}

export function channelSwapCube(size, mapping = [2, 1, 0]) {
  const lines = [`TITLE "channel-swap"`, `LUT_3D_SIZE ${size}`];
  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const rgb = [ix, iy, iz].map((index) => index / (size - 1));
        lines.push(mapping.map((source) => format(rgb[source])).join(' '));
      }
    }
  }
  return lines.join('\n');
}

export function gammaStaircaseCube(size, gamma = 2.2) {
  const lines = [`TITLE "gamma-staircase"`, `LUT_3D_SIZE ${size}`];
  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const rgb = [ix, iy, iz].map((index) => Math.pow(index / (size - 1), gamma));
        lines.push(rgb.map(format).join(' '));
      }
    }
  }
  return lines.join('\n');
}

export function cornerValueLut2() {
  const size = 2;
  const data = new Float64Array(size ** 3 * 3);
  const cornerValues = {
    '0,0,0': [0.10, 0.11, 0.12],
    '1,0,0': [0.20, 0.21, 0.22],
    '0,1,0': [0.30, 0.31, 0.32],
    '1,1,0': [0.40, 0.41, 0.42],
    '0,0,1': [0.50, 0.51, 0.52],
    '1,0,1': [0.60, 0.61, 0.62],
    '0,1,1': [0.70, 0.71, 0.72],
    '1,1,1': [0.80, 0.81, 0.82],
  };
  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const base = (iz * size + iy) * size + ix;
        data.set(cornerValues[`${ix},${iy},${iz}`], base * 3);
      }
    }
  }
  return {
    lut: new Lut3D({ size, data, colorSpace: 'linear' }),
    cornerValues,
  };
}

export function customLut(size, valueFn, options = {}) {
  const data = new Float64Array(size ** 3 * 3);
  for (let iz = 0; iz < size; iz += 1) {
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const normalized = [ix / (size - 1), iy / (size - 1), iz / (size - 1)];
        const rgb = valueFn(normalized);
        const base = (iz * size * size + iy * size + ix) * 3;
        data.set(rgb, base);
      }
    }
  }
  return new Lut3D({ size, data, ...options });
}
