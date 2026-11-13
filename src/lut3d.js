import { LutArgumentError } from './errors.js';
import { COLOR_SPACES } from './colorspace.js';

export const INTERPOLATION = Object.freeze({
  TRILINEAR: 'trilinear',
  TETRAHEDRAL: 'tetrahedral',
});

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function sanitizeInput(value) {
  return Number.isFinite(value) ? value : (value > 0 ? Number.POSITIVE_INFINITY : 0);
}

export class Lut3D {
  constructor(options = {}) {
    const {
      size,
      data,
      domainMin = [0, 0, 0],
      domainMax = [1, 1, 1],
      title = null,
      warnings = [],
      colorSpace = COLOR_SPACES.SRGB,
    } = options;

    if (!Number.isInteger(size) || size < 2) {
      throw new LutArgumentError('LUT size 必须是 >= 2 的整数');
    }
    const expectedLength = size ** 3 * 3;
    if (!(data instanceof Float64Array) || data.length !== expectedLength) {
      throw new LutArgumentError(`data 必须是长度 ${expectedLength} 的 Float64Array`);
    }
    if (![COLOR_SPACES.SRGB, COLOR_SPACES.LINEAR].includes(colorSpace)) {
      throw new LutArgumentError(`不支持的色彩空间: ${colorSpace}`);
    }

    this.size = size;
    this.data = data;
    this.domainMin = Float64Array.from(domainMin);
    this.domainMax = Float64Array.from(domainMax);
    this.title = title;
    this.warnings = warnings;
    this.colorSpace = colorSpace;
  }

  indexOf(ix, iy, iz) {
    const n = this.size;
    return (iz * n + iy) * n + ix;
  }

  corner(ix, iy, iz) {
    const base = this.indexOf(ix, iy, iz) * 3;
    return [
      this.data[base],
      this.data[base + 1],
      this.data[base + 2],
    ];
  }

  sample(inputRgb, method = INTERPOLATION.TRILINEAR) {
    if (![INTERPOLATION.TRILINEAR, INTERPOLATION.TETRAHEDRAL].includes(method)) {
      throw new LutArgumentError(`不支持的插值方式: ${method}`);
    }

    const n = this.size;
    const normalized = new Float64Array(3);
    for (let channel = 0; channel < 3; channel += 1) {
      const span = this.domainMax[channel] - this.domainMin[channel];
      let value = (sanitizeInput(inputRgb[channel]) - this.domainMin[channel]) / span;
      value = clamp01(value);
      normalized[channel] = value;
    }

    const scaled = [normalized[0] * (n - 1), normalized[1] * (n - 1), normalized[2] * (n - 1)];
    const floorIndex = (value) => Math.min(Math.floor(value), n - 1);
    const ix0 = floorIndex(scaled[0]);
    const iy0 = floorIndex(scaled[1]);
    const iz0 = floorIndex(scaled[2]);
    const ix = Math.min(ix0, n - 2);
    const iy = Math.min(iy0, n - 2);
    const iz = Math.min(iz0, n - 2);
    const fraction = (scaledValue, floorValue) => {
      const value = clamp01(scaledValue - floorValue);
      return Object.is(value, -0) || Math.abs(value) < Number.EPSILON ? 0 : value;
    };
    const fx = fraction(scaled[0], ix);
    const fy = fraction(scaled[1], iy);
    const fz = fraction(scaled[2], iz);

    if (method === INTERPOLATION.TRILINEAR) {
      return this.sampleTrilinear(ix, iy, iz, fx, fy, fz);
    }
    return this.sampleTetrahedral(ix, iy, iz, fx, fy, fz);
  }

  sampleTrilinear(ix, iy, iz, fx, fy, fz) {
    const result = [0, 0, 0];
    for (let dz = 0; dz <= 1; dz += 1) {
      for (let dy = 0; dy <= 1; dy += 1) {
        for (let dx = 0; dx <= 1; dx += 1) {
          const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
          const base = this.indexOf(ix + dx, iy + dy, iz + dz) * 3;
          result[0] += weight * this.data[base];
          result[1] += weight * this.data[base + 1];
          result[2] += weight * this.data[base + 2];
        }
      }
    }
    return result;
  }

  sampleTetrahedral(ix, iy, iz, fx, fy, fz) {
    const c000 = this.corner(ix, iy, iz);
    const c100 = this.corner(ix + 1, iy, iz);
    const c010 = this.corner(ix, iy + 1, iz);
    const c110 = this.corner(ix + 1, iy + 1, iz);
    const c001 = this.corner(ix, iy, iz + 1);
    const c101 = this.corner(ix + 1, iy, iz + 1);
    const c011 = this.corner(ix, iy + 1, iz + 1);
    const c111 = this.corner(ix + 1, iy + 1, iz + 1);

    let weights;
    let corners;
    if (fx > fy) {
      if (fy > fz) {
        weights = [1 - fx, fx - fy, fy - fz, fz];
        corners = [c000, c100, c110, c111];
      } else if (fx > fz) {
        weights = [1 - fx, fx - fz, fz - fy, fy];
        corners = [c000, c100, c101, c111];
      } else {
        weights = [1 - fz, fz - fx, fx - fy, fy];
        corners = [c000, c001, c101, c111];
      }
    } else if (fy > fz) {
      if (fx > fz) {
        weights = [1 - fy, fy - fx, fx - fz, fz];
        corners = [c000, c010, c110, c111];
      } else {
        weights = [1 - fy, fy - fz, fz - fx, fx];
        corners = [c000, c010, c011, c111];
      }
    } else if (fz > fy) {
      weights = [1 - fz, fz - fy, fy - fx, fx];
      corners = [c000, c001, c011, c111];
    } else {
      weights = [1 - fz, fz - fx, fx - fy, fy];
      corners = [c000, c001, c101, c111];
    }

    const result = [0, 0, 0];
    for (let cornerIndex = 0; cornerIndex < 4; cornerIndex += 1) {
      const weight = weights[cornerIndex];
      const corner = corners[cornerIndex];
      result[0] += weight * corner[0];
      result[1] += weight * corner[1];
      result[2] += weight * corner[2];
    }
    return result;
  }
}
