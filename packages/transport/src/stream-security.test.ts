import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { SerialLineStreamPort } from "./transport.js";

describe("S01 stream retained-state bounds", () => {
  it("rejects 10000 short lines before retaining 20000 bytes under a four-byte cap", async () => {
    const input = new PassThrough(), output = new PassThrough();
    const port = new SerialLineStreamPort({ input, output, maxBufferedBytes: 4 });
    input.write("x\n".repeat(10000));
    const diagnostic = port as unknown as { buffer: string };
    const retainedBytes = Buffer.byteLength(diagnostic.buffer);
    try {
      expect(retainedBytes, `baseline retains ${retainedBytes} bytes`).toBeLessThanOrEqual(4);
      await expect(port.readLine()).rejects.toThrow(/buffer|limit|bound/i);
    } finally { port.close(); }
  });

  it("pauses queued complete lines and resumes after consumption", async () => {
    const input = new PassThrough(), output = new PassThrough();
    const port = new SerialLineStreamPort({ input, output, maxBufferedBytes: 4 });
    try {
      input.write("a\nb\n");
      expect(input.isPaused()).toBe(true);
      expect(await port.readLine()).toBe("a\n");
      expect(await port.readLine()).toBe("b\n");
      expect(input.isPaused()).toBe(false);
    } finally { port.close(); }
  });

  it("bounds pending readers and rejects them on close", async () => {
    const port = new SerialLineStreamPort({ input: new PassThrough(), output: new PassThrough() });
    const first = port.readLine();
    const firstCheck = expect(first).rejects.toThrow(/clos/i);
    const secondCheck = expect(port.readLine()).rejects.toThrow(/pending|progress/i);
    port.close();
    await Promise.all([firstCheck, secondCheck]);
  });

  it("cancels a stalled pending write and rejects later writes", async () => {
    const output = new Writable({ write() {} });
    const port = new SerialLineStreamPort({ input: new PassThrough(), output });
    const write = port.writeLine("x");
    const check = expect(write).rejects.toThrow(/clos/i);
    port.close();
    await check;
    await expect(port.writeLine("x")).rejects.toThrow(/clos/i);
  });
});
