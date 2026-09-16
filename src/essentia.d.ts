declare module "essentia.js/dist/essentia-wasm.es.js" {
  // Emscripten module object (initializes asynchronously via onRuntimeInitialized)
  export const EssentiaWASM: any;
}

declare module "essentia.js/dist/essentia.js-core.es.js" {
  const Essentia: any;
  export default Essentia;
}
