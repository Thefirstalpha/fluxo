/** Module Argon2 autonome de hash-wasm (WebAssembly embarqué, ~30 Ko) — voir ADR-027. */
declare module 'hash-wasm/dist/argon2.umd.min.js' {
  export interface Argon2Options {
    password: string | Uint8Array
    salt: string | Uint8Array
    secret?: string | Uint8Array
    iterations: number
    parallelism: number
    memorySize: number
    hashLength: number
    outputType: 'binary'
  }
  export function argon2id(options: Argon2Options): Promise<Uint8Array>
}
