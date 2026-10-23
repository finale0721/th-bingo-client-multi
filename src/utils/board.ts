export class BoardSpec {
  readonly size: number;
  readonly area: number;

  constructor(size: number) {
    if (size < 4 || size > 6) {
      throw new Error(`Board size must be 4, 5, or 6, got ${size}`);
    }
    this.size = size;
    this.area = size * size;
  }

  row(index: number): number {
    return Math.floor(index / this.size);
  }

  col(index: number): number {
    return index % this.size;
  }

  index(row: number, col: number): number {
    return row * this.size + col;
  }

  isValidIndex(index: number): boolean {
    return index >= 0 && index < this.area;
  }

  rows(): number[][] {
    const result: number[][] = [];
    for (let r = 0; r < this.size; r++) {
      const row: number[] = [];
      for (let c = 0; c < this.size; c++) {
        row.push(this.index(r, c));
      }
      result.push(row);
    }
    return result;
  }

  cols(): number[][] {
    const result: number[][] = [];
    for (let c = 0; c < this.size; c++) {
      const col: number[] = [];
      for (let r = 0; r < this.size; r++) {
        col.push(this.index(r, c));
      }
      result.push(col);
    }
    return result;
  }

  diagonals(): number[][] {
    if (this.size < 5) return [];
    const mainDiag: number[] = [];
    const antiDiag: number[] = [];
    for (let i = 0; i < this.size; i++) {
      mainDiag.push(this.index(i, i));
      antiDiag.push(this.index(i, this.size - 1 - i));
    }
    return [mainDiag, antiDiag];
  }

  winningLines(extraLines: number[][] = []): number[][] {
    const lines: number[][] = [];
    lines.push(...this.rows());
    lines.push(...this.cols());
    lines.push(...this.diagonals());
    lines.push(...extraLines);
    return lines;
  }

  outerRingIndices(): number[] {
    const indices: number[] = [];
    for (let c = 0; c < this.size; c++) {
      indices.push(this.index(0, c));
      if (this.size > 1) indices.push(this.index(this.size - 1, c));
    }
    for (let r = 1; r < this.size - 1; r++) {
      indices.push(this.index(r, 0));
      indices.push(this.index(r, this.size - 1));
    }
    return indices;
  }

  innerIndices(): number[] {
    const outer = new Set(this.outerRingIndices());
    const result: number[] = [];
    for (let i = 0; i < this.area; i++) {
      if (!outer.has(i)) result.push(i);
    }
    return result;
  }

  centerIndices(): number[] {
    if (this.size % 2 === 1) {
      const mid = Math.floor(this.size / 2);
      return [this.index(mid, mid)];
    }
    const mid1 = this.size / 2 - 1;
    const mid2 = this.size / 2;
    return [
      this.index(mid1, mid1),
      this.index(mid1, mid2),
      this.index(mid2, mid1),
      this.index(mid2, mid2),
    ];
  }

  neighbors4(index: number): number[] {
    const r = this.row(index);
    const c = this.col(index);
    const result: number[] = [];
    if (r > 0) result.push(this.index(r - 1, c));
    if (r < this.size - 1) result.push(this.index(r + 1, c));
    if (c > 0) result.push(this.index(r, c - 1));
    if (c < this.size - 1) result.push(this.index(r, c + 1));
    return result;
  }

  neighbors8(index: number): number[] {
    const r = this.row(index);
    const c = this.col(index);
    const result: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < this.size && nc >= 0 && nc < this.size) {
          result.push(this.index(nr, nc));
        }
      }
    }
    return result;
  }

  static readonly DEFAULT = new BoardSpec(5);
}
