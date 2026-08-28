/** A readable handle sized up front, so routes can set Content-Length. */
export interface StorageStream {
  stream: ReadableStream<Uint8Array>;
  size: number;
}

export interface Storage {
  put(key: string, buf: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  /**
   * Like get(), but without materializing the whole file in memory - a
   * fullPage PNG can be tens of MB decoded, one buffer per concurrent
   * request. Serving routes should prefer this.
   */
  getStream(key: string): Promise<StorageStream>;
  delete(key: string): Promise<void>;
  urlFor(key: string): string;
}
