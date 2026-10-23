export interface ZipFileEntry {
  name: string;
  content: string | Uint8Array | ArrayBuffer;
  lastModified?: Date;
}

const textEncoder = new TextEncoder();
let crcTable: Uint32Array | null = null;

const buildCrcTable = () => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
};

const getCrcTable = () => {
  if (!crcTable) {
    crcTable = buildCrcTable();
  }
  return crcTable;
};

const calculateCrc32 = (bytes: Uint8Array) => {
  const table = getCrcTable();
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  });
  return (crc ^ 0xffffffff) >>> 0;
};

const toUint8Array = (content: ZipFileEntry["content"]) => {
  if (typeof content === "string") {
    return textEncoder.encode(content);
  }
  if (content instanceof Uint8Array) {
    return content;
  }
  return new Uint8Array(content);
};

const sanitizeZipName = (name: string) => {
  const normalized = name.replace(/\\/g, "/").trim();
  const safeName = normalized
    .split("/")
    .map((segment) => segment.replace(/[<>:"|?*]+/g, "_").trim())
    .filter(Boolean)
    .join("/");
  return safeName || "export.txt";
};

const getDosDateTime = (input: Date) => {
  const date = new Date(input);
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
};

const writeUint16 = (view: DataView, offset: number, value: number) => {
  view.setUint16(offset, value & 0xffff, true);
};

const writeUint32 = (view: DataView, offset: number, value: number) => {
  view.setUint32(offset, value >>> 0, true);
};

const UTF8_FLAG = 0x0800;

const createLocalHeader = (
  fileNameLength: number,
  crc32: number,
  dataLength: number,
  dosTime: number,
  dosDate: number,
) => {
  const buffer = new ArrayBuffer(30);
  const view = new DataView(buffer);
  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, UTF8_FLAG);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, dosTime);
  writeUint16(view, 12, dosDate);
  writeUint32(view, 14, crc32);
  writeUint32(view, 18, dataLength);
  writeUint32(view, 22, dataLength);
  writeUint16(view, 26, fileNameLength);
  writeUint16(view, 28, 0);
  return new Uint8Array(buffer);
};

const createCentralHeader = (
  fileNameLength: number,
  crc32: number,
  dataLength: number,
  dosTime: number,
  dosDate: number,
  localHeaderOffset: number,
) => {
  const buffer = new ArrayBuffer(46);
  const view = new DataView(buffer);
  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 20);
  writeUint16(view, 8, UTF8_FLAG);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, dosTime);
  writeUint16(view, 14, dosDate);
  writeUint32(view, 16, crc32);
  writeUint32(view, 20, dataLength);
  writeUint32(view, 24, dataLength);
  writeUint16(view, 28, fileNameLength);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, localHeaderOffset);
  return new Uint8Array(buffer);
};

const createEndOfCentralDirectory = (entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number) => {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralDirectorySize);
  writeUint32(view, 16, centralDirectoryOffset);
  writeUint16(view, 20, 0);
  return new Uint8Array(buffer);
};

const getByteLength = (chunks: Uint8Array[]) => chunks.reduce((total, chunk) => total + chunk.byteLength, 0);

export const createZipArchive = (entries: ZipFileEntry[]) => {
  const fileEntries = entries.filter((entry) => entry.name && entry.content !== undefined);
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  fileEntries.forEach((entry) => {
    const nameBytes = textEncoder.encode(sanitizeZipName(entry.name));
    const dataBytes = toUint8Array(entry.content);
    const modifiedAt = entry.lastModified || new Date();
    const { date, time } = getDosDateTime(modifiedAt);
    const crc32 = calculateCrc32(dataBytes);
    const localHeader = createLocalHeader(nameBytes.byteLength, crc32, dataBytes.byteLength, time, date);
    const centralHeader = createCentralHeader(nameBytes.byteLength, crc32, dataBytes.byteLength, time, date, localOffset);

    localChunks.push(localHeader, nameBytes, dataBytes);
    centralChunks.push(centralHeader, nameBytes);

    localOffset += localHeader.byteLength + nameBytes.byteLength + dataBytes.byteLength;
  });

  const centralDirectoryOffset = localOffset;
  const centralDirectorySize = getByteLength(centralChunks);
  const endRecord = createEndOfCentralDirectory(fileEntries.length, centralDirectorySize, centralDirectoryOffset);

  return new Blob([...localChunks, ...centralChunks, endRecord], { type: "application/zip" });
};

export default createZipArchive;
