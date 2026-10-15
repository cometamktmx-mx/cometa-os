// Synthetic EAN-13 images, never client labels. Tests decoding, not camera hardware.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { MultiFormatReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } = require('@zxing/library');
const left = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const parity = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
const invert = s => [...s].map(c => c === '0' ? '1' : '0').join('');
function ean(digits) {
  let result = '101';
  for (let i = 1; i <= 6; i++) {
    const pattern = left[Number(digits[i])];
    result += parity[Number(digits[0])][i-1] === 'L' ? pattern : invert([...pattern].reverse().join(''));
  }
  result += '01010';
  for (let i = 7; i < 13; i++) result += invert(left[Number(digits[i])]);
  return '000000000000' + result + '101000000000000';
}
for (const digits of ['0012345678905','7501234567893']) {
  const bars = ean(digits), width = bars.length * 3, height = 100;
  const pixels = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = bars[Math.floor(x / 3)] === '1' ? 0 : 255;
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
  const decoded = new MultiFormatReader().decode(bitmap, new Map()).getText();
  // EAN-13 beginning in zero is correctly represented as UPC-A by ZXing.
  assert.equal(decoded, digits[0] === '0' ? digits.slice(1) : digits);
}
const source = fs.readFileSync('src/components/pos-camera-scanner.tsx','utf8');
assert.match(source, /armed\.current = false/);
assert.match(source, /track\.stop\(\)/);
console.log('PASS: synthetic EAN-13 / UPC-A decode. Real camera, focus, Code 128 labels and mobile permission checks pending.');
