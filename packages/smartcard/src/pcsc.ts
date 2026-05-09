import { CommandApdu, ResponseApdu } from "./apdu.js";

export class PcscUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PcscUnavailableError";
  }
}

export type PcscTransmitResult = {
  data: Uint8Array | readonly number[];
  sw1: number;
  sw2: number;
};

export type PcscConnection = {
  connect?: () => Promise<void> | void;
  transmit: (command: Uint8Array) => Promise<PcscTransmitResult> | PcscTransmitResult;
};

export type PcscReader = {
  connect: () => Promise<PcscConnection> | PcscConnection;
};

export type PcscReaderProvider = () => Promise<PcscReader[]> | PcscReader[];

function assertStatusByte(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${label} must fit in one byte`);
  }
}

function responseDataToBytes(data: Uint8Array | readonly number[]): Uint8Array<ArrayBuffer> {
  if (!(data instanceof Uint8Array) && !Array.isArray(data)) {
    throw new Error("PC/SC response data must be a byte array");
  }
  const bytes = Array.from(data, (byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
      throw new Error("PC/SC response data bytes must fit in one byte");
    }
    return byte;
  });
  const responseData = new Uint8Array(bytes.length);
  responseData.set(bytes);
  return responseData;
}

function assertTransmitResult(response: PcscTransmitResult): void {
  if (typeof response !== "object" || response === null || Array.isArray(response)) {
    throw new Error("PC/SC transmit result must be an object");
  }
}

export class PcscApduTransport {
  constructor(private readonly connection: PcscConnection) {}

  static async fromFirstReader(readers: PcscReaderProvider): Promise<PcscApduTransport> {
    let readerList: PcscReader[];
    try {
      readerList = await readers();
      if (!Array.isArray(readerList)) {
        throw new Error("reader provider did not return a reader list");
      }
    } catch (error) {
      throw new PcscUnavailableError("PC/SC reader provider failed");
    }
    if (readerList.length === 0) throw new PcscUnavailableError("no PC/SC smartcard readers found");
    let connection: PcscConnection;
    try {
      connection = await readerList[0].connect();
      await connection.connect?.();
    } catch (error) {
      throw new PcscUnavailableError("PC/SC reader connection failed");
    }
    return new PcscApduTransport(connection);
  }

  async exchange(command: CommandApdu): Promise<ResponseApdu> {
    let response: PcscTransmitResult;
    try {
      response = await this.connection.transmit(command.toBytes());
    } catch {
      throw new PcscUnavailableError("PC/SC APDU exchange failed");
    }
    assertTransmitResult(response);
    assertStatusByte(response.sw1, "sw1");
    assertStatusByte(response.sw2, "sw2");
    return new ResponseApdu(responseDataToBytes(response.data), (response.sw1 << 8) | response.sw2);
  }
}
