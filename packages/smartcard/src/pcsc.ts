import { CommandApdu, ResponseApdu } from "./apdu.js";

export class PcscUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PcscUnavailableError";
  }
}

export type PcscTransmitResult = {
  data: Uint8Array;
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

export class PcscApduTransport {
  constructor(private readonly connection: PcscConnection) {}

  static async fromFirstReader(readers: PcscReaderProvider): Promise<PcscApduTransport> {
    const readerList = await readers();
    if (readerList.length === 0) throw new PcscUnavailableError("no PC/SC smartcard readers found");
    const connection = await readerList[0].connect();
    await connection.connect?.();
    return new PcscApduTransport(connection);
  }

  async exchange(command: CommandApdu): Promise<ResponseApdu> {
    const response = await this.connection.transmit(command.toBytes());
    assertStatusByte(response.sw1, "sw1");
    assertStatusByte(response.sw2, "sw2");
    return new ResponseApdu(Uint8Array.from(response.data), (response.sw1 << 8) | response.sw2);
  }
}
