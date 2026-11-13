export const COLOR_SPACES = Object.freeze({
  SRGB: 'srgb',
  LINEAR: 'linear',
});

const SRGB_CUTOFF = 0.04045;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_EXPONENT = 2.4;
const SRGB_ALPHA = 1.055;

export function srgbToLinear(value) {
  if (value <= SRGB_CUTOFF) {
    return value / SRGB_LINEAR_SLOPE;
  }
  return Math.pow((value + 0.055) / SRGB_ALPHA, SRGB_EXPONENT);
}

export function linearToSrgb(value) {
  if (value <= 0.0) {
    return 0.0;
  }
  if (value <= SRGB_CUTOFF / SRGB_LINEAR_SLOPE) {
    return value * SRGB_LINEAR_SLOPE;
  }
  return SRGB_ALPHA * Math.pow(value, 1 / SRGB_EXPONENT) - 0.055;
}

export function toLinear(value, colorSpace) {
  if (colorSpace === COLOR_SPACES.LINEAR) {
    return value;
  }
  if (colorSpace === COLOR_SPACES.SRGB) {
    return srgbToLinear(value);
  }
  throw new Error(`未知色彩空间: ${colorSpace}`);
}

export function fromLinear(value, colorSpace) {
  if (colorSpace === COLOR_SPACES.LINEAR) {
    return value;
  }
  if (colorSpace === COLOR_SPACES.SRGB) {
    return linearToSrgb(value);
  }
  throw new Error(`未知色彩空间: ${colorSpace}`);
}
