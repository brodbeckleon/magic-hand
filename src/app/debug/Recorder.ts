import { encodeLine, type RecLine } from "../../core/recording/format.ts";

/** Gzip-compresses recording lines in memory as they come in; nothing touches the disk until save. */
export class Recorder {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly done: Promise<Uint8Array>;
  private readonly encoder = new TextEncoder();
  frames = 0;
  bytesIn = 0;

  constructor() {
    const gz = new CompressionStream("gzip");
    this.writer = gz.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array>;
    this.done = new Response(gz.readable).arrayBuffer().then((b) => new Uint8Array(b));
  }

  write(line: RecLine): void {
    if (line.type === "frame") this.frames++;
    const bytes = this.encoder.encode(encodeLine(line));
    this.bytesIn += bytes.length;
    void this.writer.write(bytes);
  }

  /** Finishes the gzip stream and returns the file contents. */
  async finish(): Promise<Uint8Array> {
    await this.writer.close();
    return this.done;
  }
}

/** Decompresses (if gzip) and returns the text of a recording file. */
export async function readRecordingFile(file: Blob): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gz = head[0] === 0x1f && head[1] === 0x8b;
  const stream = gz ? file.stream().pipeThrough(new DecompressionStream("gzip")) : file.stream();
  return new Response(stream).text();
}
