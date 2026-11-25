declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  const workerModule: unknown
  export default workerModule
}

declare module 'tesseract.js-core/tesseract-core-lstm.wasm.js' {
  const initTesseractCore: (options?: Record<string, unknown>) => Promise<unknown>
  export default initTesseractCore
}
