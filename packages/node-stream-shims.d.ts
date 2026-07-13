declare module "node:stream" {
  export class Writable {
    constructor(options?: {
      write?(chunk: unknown, encoding: string, callback: (error?: Error | null) => void): void
      final?(callback: (error?: Error | null) => void): void
    })
  }

  export class Readable {
    static from(value: Iterable<unknown> | AsyncIterable<unknown> | ArrayLike<unknown>): Readable
  }
}

declare module "node:buffer" {
  export class Buffer extends Uint8Array {
    static from(value: Uint8Array | ArrayBuffer | string): Buffer
  }
}
