import { Lut3D, INTERPOLATION } from './lut3d.js';
import { LutArgumentError } from './errors.js';
import { COLOR_SPACES, toLinear, fromLinear } from './colorspace.js';

const DEFAULT_OPTIONS = Object.freeze({
  inputColorSpace: COLOR_SPACES.SRGB,
  outputColorSpace: COLOR_SPACES.SRGB,
  interpolation: INTERPOLATION.TRILINEAR,
  inPlace: false,
  valueRange: 1,
  lutWorkingSpace: null,
});

function resolveOptions(options) {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const validSpaces = [COLOR_SPACES.SRGB, COLOR_SPACES.LINEAR];
  if (!validSpaces.includes(resolved.inputColorSpace)) {
    throw new LutArgumentError(`不支持的输入色彩空间: ${resolved.inputColorSpace}`);
  }
  if (!validSpaces.includes(resolved.outputColorSpace)) {
    throw new LutArgumentError(`不支持的输出色彩空间: ${resolved.outputColorSpace}`);
  }
  if (![INTERPOLATION.TRILINEAR, INTERPOLATION.TETRAHEDRAL].includes(resolved.interpolation)) {
    throw new LutArgumentError(`不支持的插值方式: ${resolved.interpolation}`);
  }
  if (!(Number.isFinite(resolved.valueRange) && resolved.valueRange > 0)) {
    throw new LutArgumentError('valueRange 必须是正数（通常为 1 或 255）');
  }
  if (resolved.lutWorkingSpace !== null
    && ![COLOR_SPACES.SRGB, COLOR_SPACES.LINEAR].includes(resolved.lutWorkingSpace)) {
    throw new LutArgumentError(`不支持的 LUT 工作空间: ${resolved.lutWorkingSpace}`);
  }
  return resolved;
}

function sanitizeComponent(value) {
  return Number.isFinite(value) ? value : 0;
}

function isIdentityLut(lut) {
  const n = lut.size;
  for (let iz = 0; iz < n; iz += 1) {
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const base = (iz * n + iy) * n + ix;
        const expected = [
          lut.domainMin[0] + (ix / (n - 1)) * (lut.domainMax[0] - lut.domainMin[0]),
          lut.domainMin[1] + (iy / (n - 1)) * (lut.domainMax[1] - lut.domainMin[1]),
          lut.domainMin[2] + (iz / (n - 1)) * (lut.domainMax[2] - lut.domainMin[2]),
        ];
        for (let channel = 0; channel < 3; channel += 1) {
          if (lut.data[base * 3 + channel] !== expected[channel]) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

export function mapPixel(lut, rgba, options = {}) {
  if (!(lut instanceof Lut3D)) {
    throw new LutArgumentError('mapPixel 的第一个参数必须是 Lut3D 实例');
  }
  if (!Array.isArray(rgba) || rgba.length !== 4) {
    throw new LutArgumentError('mapPixel 的像素必须是长度为 4 的数组');
  }
  const resolved = resolveOptions(options);
  const frame = Float64Array.from(rgba.map(sanitizeComponent));
  const mapped = applyFrame(lut, frame, { ...resolved, inPlace: true });
  return Array.from(mapped);
}

export function applyFrame(lut, frame, options = {}) {
  if (lut === null || lut === undefined) {
    throw new LutArgumentError('applyFrame 缺少 LUT；空 LUT 请用 parseCube(..., { allowEmpty: true }) 后自行短路');
  }
  if (!(lut instanceof Lut3D)) {
    throw new LutArgumentError('applyFrame 的第一个参数必须是 Lut3D 实例');
  }
  if (!ArrayBuffer.isView(frame) || frame.length % 4 !== 0) {
    throw new LutArgumentError('frame 必须是长度为 4 的倍数的 TypedArray (RGBA 交错)');
  }

  const resolved = resolveOptions(options);
  const output = resolved.inPlace ? frame : new frame.constructor(frame);
  const scale = resolved.valueRange;

  if (isIdentityLut(lut)) {
    for (let index = 0; index < frame.length; index += 4) {
      output[index] = sanitizeComponent(frame[index]);
      output[index + 1] = sanitizeComponent(frame[index + 1]);
      output[index + 2] = sanitizeComponent(frame[index + 2]);
      output[index + 3] = frame[index + 3];
    }
    return output;
  }

  const workingSpace = resolved.lutWorkingSpace ?? lut.colorSpace;
  const convertLut = workingSpace !== lut.colorSpace;
  let workingLut = lut;
  if (convertLut && workingSpace === COLOR_SPACES.LINEAR) {
    const linearData = new Float64Array(lut.data.length);
    for (let index = 0; index < lut.data.length; index += 1) {
      linearData[index] = toLinear(lut.data[index], COLOR_SPACES.SRGB);
    }
    workingLut = new Lut3D({
      size: lut.size,
      data: linearData,
      domainMin: Array.from(lut.domainMin, (value) => toLinear(value, COLOR_SPACES.SRGB)),
      domainMax: Array.from(lut.domainMax, (value) => toLinear(value, COLOR_SPACES.SRGB)),
      colorSpace: COLOR_SPACES.LINEAR,
    });
  }

  for (let index = 0; index < frame.length; index += 4) {
    const input = [
      sanitizeComponent(frame[index]) / scale,
      sanitizeComponent(frame[index + 1]) / scale,
      sanitizeComponent(frame[index + 2]) / scale,
    ];

    const workingInput = [
      toLinear(input[0], resolved.inputColorSpace),
      toLinear(input[1], resolved.inputColorSpace),
      toLinear(input[2], resolved.inputColorSpace),
    ];
    let sampleInput = workingInput;
    if (workingSpace === COLOR_SPACES.SRGB) {
      sampleInput = workingInput.map((value) => fromLinear(value, COLOR_SPACES.SRGB));
    }

    const sampled = workingLut.sample(sampleInput, resolved.interpolation);
    const linearOut = workingSpace === COLOR_SPACES.SRGB
      ? sampled.map((value) => toLinear(value, COLOR_SPACES.SRGB))
      : sampled;

    output[index] = fromLinear(linearOut[0], resolved.outputColorSpace) * scale;
    output[index + 1] = fromLinear(linearOut[1], resolved.outputColorSpace) * scale;
    output[index + 2] = fromLinear(linearOut[2], resolved.outputColorSpace) * scale;
    output[index + 3] = frame[index + 3];
  }

  return output;
}
