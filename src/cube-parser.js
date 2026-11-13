import { CubeParseError, ERROR_CODES } from './errors.js';
import { Lut3D } from './lut3d.js';

const MAX_LUT_SIZE = 512;

const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const SPECIAL_NUMERIC_RE = /^[+-]?(?:inf|infinity|nan)$/i;

const KEYWORDS = new Set([
  'TITLE',
  'LUT_3D_SIZE',
  'LUT_1D_SIZE',
  'DOMAIN_MIN',
  'DOMAIN_MAX',
]);

function isNumericToken(token) {
  return NUMERIC_RE.test(token) || SPECIAL_NUMERIC_RE.test(token);
}

function fail(code, message, lineNumber, lineText) {
  throw new CubeParseError(code, message, lineNumber, lineText);
}

function parseFiniteTriple(tokens, lineNumber, lineText, code) {
  if (tokens.length !== 4) {
    fail(code, '需要恰好 3 个数值分量', lineNumber, lineText);
  }
  const values = [tokens[1], tokens[2], tokens[3]].map((token) => Number(token));
  if (values.some((value) => !Number.isFinite(value))) {
    fail(ERROR_CODES.NON_FINITE_VALUE, '只允许有限数值，NaN/Infinity 非法', lineNumber, lineText);
  }
  return values;
}

function decodeText(input) {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new TextDecoder('utf-8').decode(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new TextDecoder('utf-8').decode(input);
  }
  throw new CubeParseError(ERROR_CODES.INVALID_TEXT, '输入必须是字符串、ArrayBuffer 或 TypedArray');
}

export function parseCube(input, options = {}) {
  const { allowEmpty = false } = options;
  const text = decodeText(input);
  const lines = text.split(/\r?\n/);

  let title = null;
  let size = null;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  let domainMinSet = false;
  let domainMaxSet = false;
  let dataStarted = false;
  let meaningfulLineCount = 0;
  const data = [];
  const seenEntries = new Set();
  const warnings = [];

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const withoutComment = rawLine.split('#', 1)[0].trim();
    if (withoutComment === '') {
      return;
    }
    meaningfulLineCount += 1;
    const tokens = withoutComment.split(/\s+/);
    const head = tokens[0];

    if (KEYWORDS.has(head)) {
      if (dataStarted) {
        fail(ERROR_CODES.UNEXPECTED_TOKEN, `关键字 ${head} 必须出现在数据条目之前`, lineNumber, withoutComment);
      }
      switch (head) {
        case 'TITLE': {
          if (title !== null) {
            fail(ERROR_CODES.DUPLICATE_KEYWORD, 'TITLE 重复声明', lineNumber, withoutComment);
          }
          const rest = withoutComment.slice(head.length).trim();
          if (rest === '') {
            fail(ERROR_CODES.INVALID_TITLE, 'TITLE 内容为空', lineNumber, withoutComment);
          }
          title = rest.startsWith('"') && rest.endsWith('"') && rest.length >= 2
            ? rest.slice(1, -1)
            : rest;
          if (title === '') {
            fail(ERROR_CODES.INVALID_TITLE, 'TITLE 内容为空', lineNumber, withoutComment);
          }
          return;
        }
        case 'LUT_1D_SIZE':
          fail(ERROR_CODES.UNSUPPORTED_LUT_TYPE, '本库只支持三维 LUT，不支持 LUT_1D_SIZE', lineNumber, withoutComment);
          break;
        case 'LUT_3D_SIZE': {
          if (size !== null) {
            fail(ERROR_CODES.DUPLICATE_KEYWORD, 'LUT_3D_SIZE 重复声明', lineNumber, withoutComment);
          }
          if (tokens.length !== 2 || !/^\d+$/.test(tokens[1])) {
            fail(ERROR_CODES.INVALID_SIZE, 'LUT_3D_SIZE 需要一个正整数', lineNumber, withoutComment);
          }
          const parsedSize = Number(tokens[1]);
          if (parsedSize < 2 || parsedSize > MAX_LUT_SIZE) {
            fail(ERROR_CODES.INVALID_SIZE, `LUT 尺寸必须在 2..${MAX_LUT_SIZE} 之间`, lineNumber, withoutComment);
          }
          size = parsedSize;
          return;
        }
        case 'DOMAIN_MIN': {
          if (domainMinSet) {
            fail(ERROR_CODES.DUPLICATE_KEYWORD, 'DOMAIN_MIN 重复声明', lineNumber, withoutComment);
          }
          domainMin = parseFiniteTriple(tokens, lineNumber, withoutComment, ERROR_CODES.INVALID_DOMAIN);
          domainMinSet = true;
          return;
        }
        case 'DOMAIN_MAX': {
          if (domainMaxSet) {
            fail(ERROR_CODES.DUPLICATE_KEYWORD, 'DOMAIN_MAX 重复声明', lineNumber, withoutComment);
          }
          domainMax = parseFiniteTriple(tokens, lineNumber, withoutComment, ERROR_CODES.INVALID_DOMAIN);
          domainMaxSet = true;
          return;
        }
        default:
          fail(ERROR_CODES.UNKNOWN_KEYWORD, `未知关键字: ${head}`, lineNumber, withoutComment);
      }
      return;
    }

    if (/^[a-zA-Z_]/.test(head) && !isNumericToken(head)) {
      fail(ERROR_CODES.UNKNOWN_KEYWORD, `未知关键字: ${head}`, lineNumber, withoutComment);
    }

    if (!isNumericToken(head)) {
      fail(ERROR_CODES.UNEXPECTED_TOKEN, `无法解析的 token: ${head}`, lineNumber, withoutComment);
    }

    if (size === null) {
      fail(ERROR_CODES.UNEXPECTED_TOKEN, '数据条目出现在 LUT_3D_SIZE 之前', lineNumber, withoutComment);
    }
    if (tokens.length !== 3) {
      fail(ERROR_CODES.UNEXPECTED_TOKEN, '每条数据必须是 R G B 三个数值', lineNumber, withoutComment);
    }
    if (tokens.some((token) => !isNumericToken(token))) {
      fail(ERROR_CODES.UNEXPECTED_TOKEN, '数据条目包含非数值 token', lineNumber, withoutComment);
    }

    const entry = tokens.map((token) => Number(token));
    if (entry.some((value) => !Number.isFinite(value))) {
      fail(ERROR_CODES.NON_FINITE_VALUE, '数据条目包含 NaN 或 Infinity', lineNumber, withoutComment);
    }

    dataStarted = true;
    const key = entry.join('|');
    if (seenEntries.has(key)) {
      warnings.push({
        code: 'DUPLICATE_ENTRY',
        message: `第 ${lineNumber} 行与更早的条目完全重复，已保留首次出现的值`,
        lineNumber,
      });
    } else {
      seenEntries.add(key);
    }
    data.push(entry[0], entry[1], entry[2]);
  });

  if (meaningfulLineCount === 0) {
    if (allowEmpty) {
      return null;
    }
    throw new CubeParseError(ERROR_CODES.EMPTY_INPUT, '.cube 文本为空或只含注释');
  }
  if (size === null) {
    throw new CubeParseError(ERROR_CODES.INVALID_TEXT, '缺少 LUT_3D_SIZE 声明');
  }

  for (let channel = 0; channel < 3; channel += 1) {
    if (!(domainMin[channel] < domainMax[channel])) {
      throw new CubeParseError(
        ERROR_CODES.INVALID_DOMAIN,
        `通道 ${channel} 的 DOMAIN_MIN 必须严格小于 DOMAIN_MAX`,
      );
    }
  }

  const expectedCount = size ** 3;
  if (data.length / 3 !== expectedCount) {
    throw new CubeParseError(
      ERROR_CODES.ENTRY_COUNT_MISMATCH,
      `三轴条目数量不符: 期望 ${expectedCount} 条，实际 ${data.length / 3} 条`,
    );
  }

  return new Lut3D({
    size,
    data: Float64Array.from(data),
    domainMin,
    domainMax,
    title,
    warnings,
  });
}
