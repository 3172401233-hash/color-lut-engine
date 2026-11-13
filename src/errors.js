export const ERROR_CODES = Object.freeze({
  EMPTY_INPUT: 'EMPTY_INPUT',
  INVALID_TEXT: 'INVALID_TEXT',
  UNSUPPORTED_LUT_TYPE: 'UNSUPPORTED_LUT_TYPE',
  INVALID_SIZE: 'INVALID_SIZE',
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  INVALID_TITLE: 'INVALID_TITLE',
  DUPLICATE_KEYWORD: 'DUPLICATE_KEYWORD',
  NON_FINITE_VALUE: 'NON_FINITE_VALUE',
  ENTRY_COUNT_MISMATCH: 'ENTRY_COUNT_MISMATCH',
  UNEXPECTED_TOKEN: 'UNEXPECTED_TOKEN',
  UNKNOWN_KEYWORD: 'UNKNOWN_KEYWORD',
});

export class CubeParseError extends Error {
  constructor(code, message, lineNumber = null, lineText = null) {
    const location = lineNumber === null ? '' : ` (line ${lineNumber}: ${lineText ?? ''})`;
    super(`${message}${location}`);
    this.name = 'CubeParseError';
    this.code = code;
    this.lineNumber = lineNumber;
    this.lineText = lineText;
  }
}

export class LutArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LutArgumentError';
    this.code = 'LUT_ARGUMENT';
  }
}
