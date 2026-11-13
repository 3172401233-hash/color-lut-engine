# color-lut-engine

纯 CPU（无 WebGL 依赖）的三维 LUT 色彩处理库。针对美术交付的 `.cube` 文件在引擎内出现
的暗部发灰、蓝通道边缘断裂问题，本库把**输入/输出色彩空间约定**与**插值方式**做成显式、
可核对的两条独立管线，便于离线预览与引擎内结果对齐。

## 功能

- 读取内存中的 `.cube` 文本（`string` / `ArrayBuffer` / `TypedArray`），不接触文件系统与 GPU。
- 校验 LUT 尺寸、三轴条目数量（`N³`）、`TITLE`、`DOMAIN_MIN/MAX` 与异常数值。
- RGBA 帧批量映射，alpha 通道原样保留，支持就地写入或返回新缓冲区。
- 三线性（trilinear）与四面体（tetrahedral）两种插值，均为确定性纯函数。
- 显式的 sRGB / linear 色彩空间约定，可指定 LUT 的工作空间。
- 多个 LUT 串联、空 LUT、不同尺寸 LUT 混合，以及烘焙成单个新 LUT。
- 超出 domain 的输入按 clamp-to-edge 钳制；NaN/Infinity 输入被消毒，不产生 NaN 输出。

## 快速上手

```js
import { parseCube, applyFrame, INTERPOLATION } from 'color-lut-engine';

const lut = parseCube(cubeText);

// 0..1 浮点 RGBA 帧
const frame = new Float32Array([0.2, 0.4, 0.8, 1]);
const out = applyFrame(lut, frame, { interpolation: INTERPOLATION.TETRAHEDRAL });

// 0..255 整数帧（如 ImageData）
const pixels = new Uint8ClampedArray(imageData.data);
applyFrame(lut, pixels, { valueRange: 255, inPlace: true });
```

## `.cube` 解析与校验

`parseCube(text, options?)` 返回 `Lut3D`，失败时抛出带 `code` 的 `CubeParseError`。

- 条目排列遵循 Adobe `.cube` 约定：红轴最快、绿轴次之、蓝轴最慢，共 `LUT_3D_SIZE³` 条。
- `LUT_3D_SIZE` 必须是 `2..512` 的整数；条目数不符抛 `ENTRY_COUNT_MISMATCH`。
- `TITLE` 必须在数据之前、不可重复；`DOMAIN_MIN/MAX` 各通道必须满足 `min < max`。
- 数据与 domain 中出现 `NaN` / `Infinity` 抛 `NON_FINITE_VALUE`。
- 完全重复的 RGB 条目不报错，记录到 `lut.warnings`（`DUPLICATE_ENTRY`）并保留首次出现的值。
- 关键字出现在数据之后、未知关键字、分量数错误等抛 `UNEXPECTED_TOKEN` / `UNKNOWN_KEYWORD`。
- 空文本默认抛 `EMPTY_INPUT`；传 `{ allowEmpty: true }` 时返回 `null`，表示“空 LUT”。
- 本库只支持 3D LUT，遇到 `LUT_1D_SIZE` 抛 `UNSUPPORTED_LUT_TYPE`。

## 色彩空间约定

暗部发灰通常来自“传输函数（transfer function）不一致”：离线预览把数值当 sRGB，引擎却在线性
光空间里直接插值，暗部被线性化后整体抬亮、对比下降。本库用三个显式选项区分这些空间：

- `inputColorSpace`：输入帧 RGB 所在空间，`'srgb'`（默认）或 `'linear'`。
- `outputColorSpace`：输出 RGB 所在空间，默认 `'srgb'`。
- `lut.colorSpace`：LUT 表项数值所在空间，解析后可设置，默认 `'srgb'`。
- `lutWorkingSpace`：采样时实际使用的工作空间，默认跟随 `lut.colorSpace`。

每像素管线：

1. 输入按 `inputColorSpace` 转到线性光（`srgbToLinear`，分段 sRGB 传递函数）。
2. 若 LUT 工作空间是 sRGB，再转回 sRGB 后进入 `Lut3D.sample`；linear LUT 则直接采样。
3. 采样结果按 LUT 工作空间转回线性光。
4. 按 `outputColorSpace` 编码输出；alpha 全程不参与变换，原样写回。

```js
// LUT 表项是 sRGB 数值，但希望在线性光空间里做物理正确的映射
applyFrame(srgbLut, frame, {
  inputColorSpace: 'srgb',
  outputColorSpace: 'linear',
  lutWorkingSpace: 'linear',
});
```

sRGB 传递函数采用标准分段公式（线性段阈值 `0.04045`、斜率 `12.92`、幂 `2.4`），而非简单
`pow(x, 2.2)`，保证暗部与主流 DCC/引擎一致。

## 插值方式与差异

两种方法都在由相邻 8 个网格点构成的立方体内工作，网格点上结果完全相同，差异只在立方体内部。

- 三线性 `INTERPOLATION.TRILINEAR`（默认）：对全部 8 个角点做可分离的三轴线形加权。
  实现简单、数值平滑，但在网格单元的内部对角面上，一阶导数可能发生变化；某些 LUT（尤其
  高对比、强通道分离）在网格边附近会显得过渡偏软。
- 四面体 `INTERPOLATION.TETRAHEDRAL`：把每个立方体切成 6 个四面体，只取包围采样点的
  4 个角点做重心加权。计算量略低，且在四面体共享面上权重连续，不会出现跨面跳变，适合
  消除蓝通道等高饱和通道在网格边附近的断裂/色带。

四面体分支按 `(fx, fy, fz)` 的严格排序选择，tie 归属在相邻分区之间保持一致，因此在
`fx=fy`、`fy=fz`、`fx=fz` 三个内部分界面上两侧结果连续。测试用 identity LUT 做全空间
穷举扫描，四面体结果误差保持在浮点舍入量级（约 `1e-16`）。

## Domain 与异常输入

- 每通道独立按 `(x - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)` 归一化，再 clamp 到 `[0,1]`，
  即超出 domain 的输入采用 clamp-to-edge，不会外推也不会回绕。
- 像素中的 `NaN` / `Infinity` 被消毒为 `0`（`+Infinity` 钳到上边界），保证输出始终有限。
- `valueRange` 只做缩放（`1` 表示 0..1 浮点，`255` 表示 0..255 整数），不改变色彩空间语义。

## LUT 串联

```js
import { chainLuts, bakeChain } from 'color-lut-engine';

// null / undefined 表示空 LUT，串联时直接跳过；全空串联等价于恒等函数
const chain = chainLuts([lutA, null, lutB], { interpolation: INTERPOLATION.TETRAHEDRAL });
const linearOut = chain([r, g, b].map(srgbToLinear));

// 把串联结果烘焙成一个新的 33³ Lut3D，尺寸可与原 LUT 不同
const baked = bakeChain([lutA, lutB], { size: 33, colorSpace: 'srgb' });
```

串联在**线性光空间**逐段传递：每段先转到该 LUT 的声明空间采样、再转回线性，因此不同尺寸、
不同色彩空间的 LUT 可以混合。`bakeChain` 在规则网格上求值，输出同样是确定性的。

## 确定性

所有映射都是无副作用的纯函数：不读取时间、随机数或全局状态。同一输入多次调用、以及调换
像素处理顺序，逐位结果一致（测试见 `test/determinism.test.js`），耗时波动不会影响输出。

## API 概览

- `parseCube(text, { allowEmpty })`：解析 `.cube`，返回 `Lut3D` 或 `null`。
- `Lut3D#sample(rgb, method)`：对单个 0..1 RGB 采样，返回新数组。
- `applyFrame(lut, frame, options)`：批量映射 RGBA `TypedArray`，alpha 不变。
- `mapPixel(lut, rgba, options)`：单像素便捷封装。
- `chainLuts(luts, { interpolation })` / `bakeChain(luts, { size, colorSpace })`。

## 测试

```bash
npm test        # 等价于 node --test
```

测试覆盖 identity、通道交换、gamma 阶梯与小尺寸（2³）LUT 的采样点、边界面、四面体分界面
连续性、色彩空间往返、串联/空 LUT/尺寸差异、NaN 与重复条目、非法文件错误码，以及与耗时
无关的确定性。

## 目录

```
src/
  cube-parser.js   .cube 词法与校验
  lut3d.js         Lut3D、三线性与四面体插值
  colorspace.js    sRGB <-> linear 传递函数
  apply.js         帧/像素映射与色彩空间管线
  chain.js         LUT 串联与烘焙
  errors.js        CubeParseError / LutArgumentError 与错误码
test/
  helpers/         identity、通道交换、gamma 阶梯等可控 LUT 构造器
```
