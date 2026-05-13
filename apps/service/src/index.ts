#!/usr/bin/env node
import { readSync, writeSync } from "node:fs";
import {
  MAX_NATIVE_MESSAGE_BYTES,
  NATIVE_MESSAGE_LENGTH_BYTES,
  decodeNativeMessage,
  encodeNativeMessage,
  handleLocalServiceRequest,
  type LocalServiceContext,
  type LocalServiceResponse
} from "@nsealr/client";
import { contextArgsFromCliArgs, loadServiceContextFromFiles } from "./context.js";
import { nativeHostManifestJsonFromArgs } from "./manifest.js";

function nativeMessageError(message: string): LocalServiceResponse {
  return {
    version: 1,
    request_id: "invalid-service-request",
    ok: false,
    error: {
      code: "invalid_native_message",
      message,
      retryable: false
    }
  };
}

export function runServiceOnce(input: Uint8Array, context: LocalServiceContext = {}): Uint8Array {
  try {
    return encodeNativeMessage(handleLocalServiceRequest(decodeNativeMessage(input), context));
  } catch (error) {
    return encodeNativeMessage(nativeMessageError(error instanceof Error ? error.message : String(error)));
  }
}

function messageLength(prefix: Uint8Array): number {
  if (prefix.byteLength !== NATIVE_MESSAGE_LENGTH_BYTES) {
    throw new Error("native message frame missing length prefix");
  }
  return new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength).getUint32(0, true);
}

function concatFrame(prefix: Uint8Array, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(prefix.byteLength + payload.byteLength);
  frame.set(prefix, 0);
  frame.set(payload, prefix.byteLength);
  return frame;
}

function encodeNativeMessageError(message: string): Uint8Array {
  return encodeNativeMessage(nativeMessageError(message));
}

export function runServiceFrames(input: Uint8Array, context: LocalServiceContext = {}): Uint8Array {
  const outputs: Uint8Array[] = [];
  let offset = 0;

  while (offset < input.byteLength) {
    try {
      if (input.byteLength - offset < NATIVE_MESSAGE_LENGTH_BYTES) {
        throw new Error("native message frame missing length prefix");
      }
      const prefix = input.slice(offset, offset + NATIVE_MESSAGE_LENGTH_BYTES);
      const length = messageLength(prefix);
      if (length > MAX_NATIVE_MESSAGE_BYTES) {
        throw new Error("native message exceeds max bytes");
      }
      const frameEnd = offset + NATIVE_MESSAGE_LENGTH_BYTES + length;
      if (frameEnd > input.byteLength) {
        throw new Error("native message length prefix does not match payload");
      }
      outputs.push(runServiceOnce(input.slice(offset, frameEnd), context));
      offset = frameEnd;
    } catch (error) {
      outputs.push(encodeNativeMessageError(error instanceof Error ? error.message : String(error)));
      break;
    }
  }

  return Buffer.concat(outputs.map((output) => Buffer.from(output)));
}

function readExactly(fd: number, byteLength: number): Uint8Array | undefined {
  const buffer = Buffer.alloc(byteLength);
  let offset = 0;
  while (offset < byteLength) {
    const bytesRead = readSync(fd, buffer, offset, byteLength - offset, null);
    if (bytesRead === 0) {
      if (offset === 0) return undefined;
      throw new Error("native message length prefix does not match payload");
    }
    offset += bytesRead;
  }
  return buffer;
}

export function runServiceStdio(options: {
  context?: LocalServiceContext;
  inputFd?: number;
  outputFd?: number;
} = {}): void {
  const inputFd = options.inputFd ?? 0;
  const outputFd = options.outputFd ?? 1;
  const context = options.context ?? {};

  while (true) {
    let prefix: Uint8Array | undefined;
    try {
      prefix = readExactly(inputFd, NATIVE_MESSAGE_LENGTH_BYTES);
      if (prefix === undefined) return;
      const length = messageLength(prefix);
      if (length > MAX_NATIVE_MESSAGE_BYTES) {
        writeSync(outputFd, encodeNativeMessageError("native message exceeds max bytes"));
        return;
      }
      const payload = readExactly(inputFd, length);
      if (payload === undefined) {
        writeSync(outputFd, encodeNativeMessageError("native message length prefix does not match payload"));
        return;
      }
      writeSync(outputFd, runServiceOnce(concatFrame(prefix, payload), context));
    } catch (error) {
      writeSync(outputFd, encodeNativeMessageError(error instanceof Error ? error.message : String(error)));
      return;
    }
  }
}

export function runServiceCli(args: string[]): void {
  if (args.length === 0) {
    runServiceStdio();
    return;
  }
  try {
    const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
    if (normalizedArgs.includes("--native-host-manifest")) {
      writeSync(1, nativeHostManifestJsonFromArgs(args));
      return;
    }
    runServiceStdio({
      context: loadServiceContextFromFiles(contextArgsFromCliArgs(args))
    });
  } catch (error) {
    writeSync(2, `${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runServiceCli(process.argv.slice(2));
}
