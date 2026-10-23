declare module "stream-json" {
  import type { Transform, TransformOptions } from "node:stream";
  export function parser(options?: TransformOptions & { jsonStreaming?: boolean }): Transform;
}

declare module "stream-json/streamers/StreamValues" {
  import type { Transform } from "node:stream";
  export function streamValues(): Transform;
}
