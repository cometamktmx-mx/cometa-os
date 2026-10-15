import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)(() => ({}), module, module.exports);
  return module.exports;
}
const { layoutForViewport } = load('src/responsive.ts');
test('layout follows available short edge and responds to orientation, not model', () => {
  for (const [w, h, expected] of [[412, 860, 'phone'], [860, 412, 'phone'], [599, 900, 'phone'], [600, 900, 'tablet-portrait'], [900, 600, 'tablet-landscape'], [1280, 744, 'tablet-landscape'], [800, 1224, 'tablet-portrait']]) {
    assert.equal(layoutForViewport(w, h), expected);
  }
});
test('four narratives reference approved local photographs and matching feature icons', () => {
  const { onboardingSlides } = load('src/onboarding/slides.ts');
  assert.deepEqual(onboardingSlides.map(s => s.image), ['01-ecosystem.png', '02-food.png', '03-retail.png', '04-omnichannel.png']);
  for (const slide of onboardingSlides) {
    assert.ok(existsSync(`public/onboarding/${slide.image}`));
    assert.equal(slide.headline.length, 2);
    assert.equal(slide.features.length, 8);
    assert.equal(slide.icons.length, slide.features.length);
  }
});
