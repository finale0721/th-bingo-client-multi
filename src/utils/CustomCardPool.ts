import * as XLSX from "xlsx";
import pako from "pako";
import { Spell } from "@/types";

export interface CustomCardPoolRow {
  index: number;
  gameCode: number;
  gameName: string;
  name: string;
  desc: string;
  rank: "L" | "EX" | "PH";
  star: number;
  bpStar: number | null;
  spellId: number;
}

export interface CustomCardPoolPayload {
  rows: CustomCardPoolRow[];
}

export interface CustomCardPoolSlot {
  id: number;
  note: string;
  fileName: string;
  updatedAt: number;
  payload: CustomCardPoolPayload;
}

export const CARD_POOL_COLUMN_TITLES = [
  "编号",
  "作品代号",
  "作品名称",
  "题目",
  "描述",
  "符卡难度",
  "评分（标准）",
  "评分（BP）",
  "符卡编号",
];

const REQUIRED_HEADERS = [
  { key: "gameCode", title: "作品代号" },
  { key: "gameName", title: "作品名称" },
  { key: "name", title: "题目" },
  { key: "desc", title: "描述" },
  { key: "rank", title: "符卡难度" },
  { key: "star", title: "评分（标准）" },
] as const;

const OPTIONAL_HEADERS = [
  { key: "index", title: "编号" },
  { key: "bpStar", title: "评分（BP）" },
  { key: "spellId", title: "符卡编号" },
] as const;

type HeaderKey = (typeof REQUIRED_HEADERS)[number]["key"] | (typeof OPTIONAL_HEADERS)[number]["key"];

const normalizeHeader = (value: unknown) => String(value ?? "").replace(/\s+/g, "").trim();
const normalizeText = (value: unknown) => String(value ?? "").trim();
const isBlank = (value: unknown) => normalizeText(value) === "";

const rowLooksLikeCardData = (row: unknown[]) => {
  const gameCode = Number(row[1]);
  const rank = normalizeText(row[5]).toUpperCase();
  const star = Number(row[6]);
  return (
    Number.isInteger(gameCode) &&
    !isBlank(row[2]) &&
    !isBlank(row[3]) &&
    !isBlank(row[4]) &&
    ["L", "EX", "PH"].includes(rank) &&
    Number.isInteger(star)
  );
};

const parseUint = (value: unknown, label: string, rowNumber: number, required = true): number | null => {
  if (isBlank(value)) {
    if (required) throw new Error(`第 ${rowNumber} 行「${label}」不能为空`);
    return null;
  }
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`第 ${rowNumber} 行「${label}」必须是非负整数`);
  }
  return num;
};

const stripParentheses = (text: string) =>
  text
    .replace(/（[^（）]*）/g, "")
    .replace(/\([^()]*\)/g, "")
    .trim();

const findHeaderColumns = (headerRow: unknown[]): Map<HeaderKey, number> => {
  const headerMap = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    if (name && !headerMap.has(name)) headerMap.set(name, index);
  });

  const result = new Map<HeaderKey, number>();
  const missing: string[] = [];
  for (const item of REQUIRED_HEADERS) {
    const index = headerMap.get(normalizeHeader(item.title));
    if (index == null) missing.push(item.title);
    else result.set(item.key, index);
  }
  if (missing.length > 0) {
    if (rowLooksLikeCardData(headerRow)) {
      throw new Error("缺少表头：第一行检测到数据字段值，请将列名放在 Sheet1 第一行");
    }
    throw new Error(`缺少必要列：${missing.join("、")}`);
  }
  for (const item of OPTIONAL_HEADERS) {
    const index = headerMap.get(normalizeHeader(item.title));
    if (index != null) result.set(item.key, index);
  }
  return result;
};

const generateSpellIds = (rows: Omit<CustomCardPoolRow, "spellId">[], provided: Array<number | null>) => {
  const usedByGame = new Map<number, Set<number>>();
  const generatedByGameAndName = new Map<string, number>();
  const result = [...provided];

  provided.forEach((value, index) => {
    if (value == null) return;
    const gameCode = rows[index].gameCode;
    const key = `${gameCode}:${stripParentheses(rows[index].name)}`;
    const used = usedByGame.get(gameCode) || new Set<number>();
    used.add(value);
    usedByGame.set(gameCode, used);
    if (!generatedByGameAndName.has(key)) generatedByGameAndName.set(key, value);
  });

  rows.forEach((row, index) => {
    if (result[index] != null) return;
    const key = `${row.gameCode}:${stripParentheses(row.name)}`;
    const existing = generatedByGameAndName.get(key);
    if (existing != null) {
      result[index] = existing;
      return;
    }
    const used = usedByGame.get(row.gameCode) || new Set<number>();
    let next = 1;
    while (used.has(next)) next++;
    used.add(next);
    usedByGame.set(row.gameCode, used);
    generatedByGameAndName.set(key, next);
    result[index] = next;
  });

  return result as number[];
};

export const readCustomCardPoolFile = async (file: File): Promise<CustomCardPoolPayload> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  if (!workbook.SheetNames.includes("Sheet1")) {
    throw new Error("卡池文件必须包含 Sheet1，且数据必须位于 Sheet1 内");
  }
  const sheet = workbook.Sheets.Sheet1;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  if (matrix.length < 2) throw new Error("Sheet1 中没有可读取的数据");

  const columns = findHeaderColumns(matrix[0]);
  const draftRows: Omit<CustomCardPoolRow, "spellId">[] = [];
  const spellIds: Array<number | null> = [];

  for (let i = 1; i < matrix.length; i++) {
    const source = matrix[i] || [];
    const rowNumber = i + 1;
    const requiredValues = REQUIRED_HEADERS.map((item) => source[columns.get(item.key)!]);
    const optionalValues = OPTIONAL_HEADERS.map((item) => source[columns.get(item.key) ?? -1]);
    if ([...requiredValues, ...optionalValues].every(isBlank)) continue;

    const rank = normalizeText(source[columns.get("rank")!]).toUpperCase();
    if (!["L", "EX", "PH"].includes(rank)) {
      throw new Error(`第 ${rowNumber} 行「符卡难度」必须是 L、EX 或 PH`);
    }

    draftRows.push({
      index: draftRows.length + 1,
      gameCode: parseUint(source[columns.get("gameCode")!], "作品代号", rowNumber)!,
      gameName: normalizeText(source[columns.get("gameName")!]),
      name: normalizeText(source[columns.get("name")!]),
      desc: normalizeText(source[columns.get("desc")!]),
      rank: rank as "L" | "EX" | "PH",
      star: parseUint(source[columns.get("star")!], "评分（标准）", rowNumber)!,
      bpStar: parseUint(source[columns.get("bpStar") ?? -1], "评分（BP）", rowNumber, false),
    });
    const last = draftRows[draftRows.length - 1];
    if (!last.gameName) throw new Error(`第 ${rowNumber} 行「作品名称」不能为空`);
    if (!last.name) throw new Error(`第 ${rowNumber} 行「题目」不能为空`);
    if (!last.desc) throw new Error(`第 ${rowNumber} 行「描述」不能为空`);
    spellIds.push(parseUint(source[columns.get("spellId") ?? -1], "符卡编号", rowNumber, false));
  }

  if (draftRows.length === 0) throw new Error("Sheet1 中没有有效数据行");
  const generatedIds = generateSpellIds(draftRows, spellIds);
  return {
    rows: draftRows.map((row, index) => ({
      ...row,
      index: index + 1,
      spellId: generatedIds[index],
    })),
  };
};

const payloadToAoA = (payload: CustomCardPoolPayload, sampleOnly = false) => {
  const source = sampleOnly ? payload.rows.slice(0, 5) : payload.rows;
  return [
    CARD_POOL_COLUMN_TITLES,
    ...source.map((row, index) => [
      index + 1,
      row.gameCode,
      row.gameName,
      row.name,
      row.desc,
      row.rank,
      row.star,
      row.bpStar ?? "",
      row.spellId,
    ]),
  ];
};

const buildWorkbook = (payload: CustomCardPoolPayload, sampleOnly = false) => {
  const worksheet = XLSX.utils.aoa_to_sheet(payloadToAoA(payload, sampleOnly));

  worksheet["!cols"] = [
    { wch: 8 }, // A: 编号
    { wch: 8 }, // B: 作品代号
    { wch: 16 }, // C: 作品名称
    { wch: 54 }, // D: 题目
    { wch: 12 }, // E: 描述
    { wch: 8 }, // F: 符卡难度
    { wch: 8 }, // G: 评分（标准）
    { wch: 8 }, // H: 评分（BP）
    { wch: 8 }, // I: 符卡编号
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return workbook;
};

export const exportCustomCardPool = (payload: CustomCardPoolPayload, fileName: string) => {
  XLSX.writeFile(buildWorkbook(payload), fileName, { bookType: "xlsx", compression: true, cellStyles: true });
};

export const exportCustomCardPoolTemplate = (payload: CustomCardPoolPayload) => {
  XLSX.writeFile(buildWorkbook(payload, true), "自定义卡池模板.xlsx", { bookType: "xlsx", compression: true, cellStyles: true });
};

export const payloadToXlsxBase64 = (payload: CustomCardPoolPayload): string => {
  const wbout = XLSX.write(buildWorkbook(payload), { bookType: "xlsx", type: "array", compression: true, cellStyles: true });
  let binary = "";
  const bytes = new Uint8Array(wbout);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const customPoolRowToSpell = (row: CustomCardPoolRow, useBpStar = false): Spell => ({
  index: row.index,
  game: String(row.gameCode),
  name: row.name,
  rank: row.rank,
  star: useBpStar && row.bpStar != null ? row.bpStar : row.star,
  desc: row.desc,
  id: row.spellId,
  fastest: 0,
  miss_time: 0,
  power_weight: 0,
  difficulty: 0,
  change_rate: 0,
  max_cap_rate: 0,
});

export const customPoolToSpells = (payload: CustomCardPoolPayload, useBpStar = false): Spell[] =>
  payload.rows.map((row) => customPoolRowToSpell(row, useBpStar));

export const getCustomPoolGames = (payload?: CustomCardPoolPayload | null) => {
  if (!payload) return [];
  const map = new Map<string, string>();
  payload.rows.forEach((row) => map.set(String(row.gameCode), row.gameName));
  return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
};

export const deflateToBase64 = (data: string): string => {
  const compressed = pako.deflate(data);
  let binary = "";
  for (let i = 0; i < compressed.byteLength; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
};

export const ungzipFromBase64 = (base64: string): string => {
  return pako.ungzip(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), { to: "string" });
};
