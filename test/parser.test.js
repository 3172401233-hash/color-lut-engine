import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCube, CubeParseError, ERROR_CODES } from '../src/index.js';
import { identityCube } from './helpers/builders.js';

test('解析合法 identity LUT：尺寸、TITLE、domain 和条目数', () => {
  const text = identityCube(4, {
    title: 'identity-4',
    domainMin: [0.0, 0.0, 0.0],
    domainMax: [1.0, 1.0, 1.0],
  });
  const lut = parseCube(text);
  assert.equal(lut.size, 4);
  assert.equal(lut.title, 'identity-4');
  assert.deepEqual(Array.from(lut.domainMin), [0, 0, 0]);
  assert.deepEqual(Array.from(lut.domainMax), [1, 1, 1]);
  assert.equal(lut.data.length, 4 ** 3 * 3);
  assert.equal(lut.data[0], 0);
  assert.equal(lut.data[lut.data.length - 1], 1);
});

test('条目排列为 R 最快、G 次之、B 最慢', () => {
  const lut = parseCube(identityCube(2));
  assert.deepEqual(lut.sample([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(lut.sample([1, 0, 0]), [1, 0, 0]);
  assert.deepEqual(lut.sample([0, 1, 0]), [0, 1, 0]);
  assert.deepEqual(lut.sample([0, 0, 1]), [0, 0, 1]);
});

test('注释与空行被忽略', () => {
  const text = `# 头注释\n\nLUT_3D_SIZE 2 # 行尾注释\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`;
  const lut = parseCube(text);
  assert.equal(lut.size, 2);
});

test('接受 ArrayBuffer / Uint8Array 输入', () => {
  const text = identityCube(2);
  const bytes = new TextEncoder().encode(text);
  assert.equal(parseCube(bytes.buffer).size, 2);
  assert.equal(parseCube(bytes).size, 2);
});

test('空文本默认抛 EMPTY_INPUT，allowEmpty 返回 null', () => {
  assert.throws(() => parseCube('   \n# only comment\n'), (error) => {
    assert.ok(error instanceof CubeParseError);
    assert.equal(error.code, ERROR_CODES.EMPTY_INPUT);
    return true;
  });
  assert.equal(parseCube('# nothing here', { allowEmpty: true }), null);
});

test('条目数量不符抛 ENTRY_COUNT_MISMATCH', () => {
  const text = `${identityCube(2).trimEnd()}\n0.5 0.5 0.5`;
  assert.throws(() => parseCube(text), (error) => error.code === ERROR_CODES.ENTRY_COUNT_MISMATCH);
  assert.throws(() => parseCube(identityCube(2).trimEnd().split('\n').slice(0, -1).join('\n')),
    (error) => error.code === ERROR_CODES.ENTRY_COUNT_MISMATCH);
});

test('尺寸非法（1、0、非整数、超大）抛 INVALID_SIZE', () => {
  assert.throws(() => parseCube('LUT_3D_SIZE 1\n'), (e) => e.code === ERROR_CODES.INVALID_SIZE);
  assert.throws(() => parseCube('LUT_3D_SIZE 0\n0 0 0\n'), (e) => e.code === ERROR_CODES.INVALID_SIZE);
  assert.throws(() => parseCube('LUT_3D_SIZE 3.5\n'), (e) => e.code === ERROR_CODES.INVALID_SIZE);
  assert.throws(() => parseCube('LUT_3D_SIZE 9999\n'), (e) => e.code === ERROR_CODES.INVALID_SIZE);
});

test('缺少 LUT_3D_SIZE 抛 INVALID_TEXT', () => {
  assert.throws(() => parseCube('TITLE "x"\n0 0 0\n'), (e) => e.code === ERROR_CODES.UNEXPECTED_TOKEN);
  assert.throws(() => parseCube('TITLE "x"\n'), (e) => e.code === ERROR_CODES.INVALID_TEXT);
});

test('TITLE 重复或空内容抛错', () => {
  assert.throws(() => parseCube('TITLE "a"\nTITLE "b"\nLUT_3D_SIZE 2\n'),
    (e) => e.code === ERROR_CODES.DUPLICATE_KEYWORD);
  assert.throws(() => parseCube('TITLE ""\nLUT_3D_SIZE 2\n'),
    (e) => e.code === ERROR_CODES.INVALID_TITLE);
});

test('DOMAIN 重复声明与 min>=max 抛 INVALID_DOMAIN', () => {
  assert.throws(() => parseCube('LUT_3D_SIZE 2\n0 0 0\nDOMAIN_MIN 0 0 0\n'),
    (e) => e.code === ERROR_CODES.UNEXPECTED_TOKEN);
  assert.throws(
    () => parseCube('DOMAIN_MIN 0 0 0\nDOMAIN_MIN 0 0 0\nLUT_3D_SIZE 2\n'),
    (e) => e.code === ERROR_CODES.DUPLICATE_KEYWORD,
  );
  const badDomain = identityCube(2, { domainMin: [0.5, 0, 0], domainMax: [0.5, 1, 1] });
  assert.throws(() => parseCube(badDomain), (e) => e.code === ERROR_CODES.INVALID_DOMAIN);
});

test('NaN / Infinity 数值抛 NON_FINITE_VALUE', () => {
  const withNaN = identityCube(2).replace('0 0 0', 'NaN 0 0');
  const withInf = identityCube(2).replace('0 0 0', 'Infinity 0 0');
  assert.throws(() => parseCube(withNaN), (e) => e.code === ERROR_CODES.NON_FINITE_VALUE);
  assert.throws(() => parseCube(withInf), (e) => e.code === ERROR_CODES.NON_FINITE_VALUE);
  assert.throws(() => parseCube('DOMAIN_MIN nan 0 0\nLUT_3D_SIZE 2\n'),
    (e) => e.code === ERROR_CODES.NON_FINITE_VALUE);
});

test('重复条目产生 warning 且不抛错，保留首次出现的值', () => {
  const text = identityCube(2).replace('1 1 1', '0 0 0');
  const lut = parseCube(text);
  assert.equal(lut.warnings.length, 1);
  assert.equal(lut.warnings[0].code, 'DUPLICATE_ENTRY');
  const lastBase = (lut.size ** 3 - 1) * 3;
  assert.deepEqual([lut.data[lastBase], lut.data[lastBase + 1], lut.data[lastBase + 2]], [0, 0, 0]);
});

test('数据分量数量错误抛 UNEXPECTED_TOKEN', () => {
  assert.throws(() => parseCube('LUT_3D_SIZE 2\n0 0\n'), (e) => e.code === ERROR_CODES.UNEXPECTED_TOKEN);
  assert.throws(() => parseCube('LUT_3D_SIZE 2\n0 0 0 0\n'), (e) => e.code === ERROR_CODES.UNEXPECTED_TOKEN);
});

test('未知关键字与关键字出现在数据之后都抛错', () => {
  assert.throws(() => parseCube('FOO_BAR 1\nLUT_3D_SIZE 2\n'),
    (e) => e.code === ERROR_CODES.UNKNOWN_KEYWORD);
  const lateKeyword = `${identityCube(2).split('\n').slice(0, 3).join('\n')}\nTITLE "late"\n${identityCube(2).split('\n').slice(3).join('\n')}`;
  assert.throws(() => parseCube(lateKeyword), (e) => e.code === ERROR_CODES.UNEXPECTED_TOKEN);
});

test('不支持 1D LUT', () => {
  assert.throws(() => parseCube('LUT_1D_SIZE 4\n0 0 0\n'),
    (e) => e.code === ERROR_CODES.UNSUPPORTED_LUT_TYPE);
});

test('非字符串且非 TypedArray 的输入抛 INVALID_TEXT', () => {
  assert.throws(() => parseCube(42), (e) => e.code === ERROR_CODES.INVALID_TEXT);
});
