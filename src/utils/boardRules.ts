import { BoardSpec } from "./board";
import { SpellStatus } from "@/types";

export function getWinningLines(board: BoardSpec, extraLines: number[][] = []): number[][] {
  return board.winningLines(extraLines);
}

export function checkLineComplete(
  spellStatus: number[],
  line: number[],
  playerFlag: SpellStatus
): boolean {
  return line.every((idx) => spellStatus[idx] === playerFlag);
}

export function countLineProgress(
  spellStatus: number[],
  line: number[],
  playerFlag: SpellStatus
): number {
  return line.filter((idx) => spellStatus[idx] === playerFlag).length;
}

export function isGamePoint(
  spellStatus: number[],
  board: BoardSpec,
  playerFlag: SpellStatus,
  extraLines: number[][] = []
): boolean {
  const lines = getWinningLines(board, extraLines);
  return lines.some((line) => countLineProgress(spellStatus, line, playerFlag) === line.length - 1);
}

export function isHalfBoardWin(count: number, board: BoardSpec): boolean {
  return count >= Math.floor(board.area / 2) + 1;
}

export function isFullBoardWin(count: number, board: BoardSpec): boolean {
  return count === board.area;
}
