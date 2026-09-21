// Bootstrap preload module: registers a Node loader hook that maps the bare
// specifier "three" (and "three/addons/") onto the repo's vendored Three.js,
// so the GLB load-test can run under Node with no npm install.
export async function resolve(specifier, context, next) {
  if (specifier === 'three') {
    return next('file:///C:/Users/xtr18/Projects/poly-strike/vendor/three.module.js', context);
  }
  if (specifier.startsWith('three/addons/')) {
    const rest = specifier.slice('three/addons/'.length);
    return next(
      'file:///C:/Users/xtr18/Projects/poly-strike/vendor/addons/' + rest,
      context
    );
  }
  return next(specifier, context);
}
