export type Board = boolean[][]

export interface Position {
  row: number
  col: number
}

/**
 * Creates an empty board (all lights off) of the given size.
 */
export function createEmptyBoard(size: number): Board {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  )
}

/**
 * Toggling a cell flips it and its orthogonal neighbours. This is the core
 * "Lights Off" rule: pressing a light also affects the ones around it.
 */
export function toggle(board: Board, { row, col }: Position): Board {
  const size = board.length
  const next = board.map((r) => r.slice())
  const deltas: Position[] = [
    { row: 0, col: 0 },
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ]
  for (const d of deltas) {
    const r = row + d.row
    const c = col + d.col
    if (r >= 0 && r < size && c >= 0 && c < size) {
      next[r][c] = !next[r][c]
    }
  }
  return next
}

/**
 * The board is solved when every light is off.
 */
export function isSolved(board: Board): boolean {
  return board.every((row) => row.every((cell) => !cell))
}

/**
 * Generates a solvable board by starting from a solved board and applying a
 * number of random toggles. Because every toggle is reversible, any board
 * produced this way is guaranteed to be solvable.
 */
export function generateBoard(
  size: number,
  moves: number,
  random: () => number = Math.random,
): Board {
  let board = createEmptyBoard(size)
  let applied = 0
  // Guard against the (rare) case where random toggles cancel out to a solved
  // board; keep going until we produce a non-trivial puzzle.
  while (applied < moves || isSolved(board)) {
    const row = Math.floor(random() * size)
    const col = Math.floor(random() * size)
    board = toggle(board, { row, col })
    applied++
    if (applied > moves * 4) break
  }
  return board
}

/**
 * Counts how many lights are currently on.
 */
export function countLit(board: Board): number {
  return board.reduce(
    (sum, row) => sum + row.reduce((s, cell) => s + (cell ? 1 : 0), 0),
    0,
  )
}
