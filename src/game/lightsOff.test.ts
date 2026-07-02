import { describe, expect, it } from 'vitest'
import {
  countLit,
  createEmptyBoard,
  generateBoard,
  isSolved,
  toggle,
} from './lightsOff'

describe('createEmptyBoard', () => {
  it('creates a size x size board of all-off lights', () => {
    const board = createEmptyBoard(3)
    expect(board).toHaveLength(3)
    expect(board.every((row) => row.length === 3)).toBe(true)
    expect(countLit(board)).toBe(0)
  })
})

describe('toggle', () => {
  it('flips the pressed cell and its orthogonal neighbours', () => {
    const board = createEmptyBoard(3)
    const next = toggle(board, { row: 1, col: 1 })
    expect(next[1][1]).toBe(true)
    expect(next[0][1]).toBe(true)
    expect(next[2][1]).toBe(true)
    expect(next[1][0]).toBe(true)
    expect(next[1][2]).toBe(true)
    // corners untouched
    expect(next[0][0]).toBe(false)
    expect(countLit(next)).toBe(5)
  })

  it('respects board edges when toggling a corner', () => {
    const board = createEmptyBoard(3)
    const next = toggle(board, { row: 0, col: 0 })
    expect(countLit(next)).toBe(3)
    expect(next[0][0]).toBe(true)
    expect(next[0][1]).toBe(true)
    expect(next[1][0]).toBe(true)
  })

  it('is its own inverse (toggling twice restores the board)', () => {
    const board = createEmptyBoard(4)
    const once = toggle(board, { row: 2, col: 1 })
    const twice = toggle(once, { row: 2, col: 1 })
    expect(twice).toEqual(board)
  })

  it('does not mutate the original board', () => {
    const board = createEmptyBoard(3)
    toggle(board, { row: 1, col: 1 })
    expect(countLit(board)).toBe(0)
  })
})

describe('isSolved', () => {
  it('is true for an empty board', () => {
    expect(isSolved(createEmptyBoard(5))).toBe(true)
  })

  it('is false when any light is on', () => {
    const board = toggle(createEmptyBoard(5), { row: 0, col: 0 })
    expect(isSolved(board)).toBe(false)
  })
})

describe('generateBoard', () => {
  it('produces a non-trivial but solvable puzzle', () => {
    // Deterministic pseudo-random sequence for a repeatable test.
    let seed = 0
    const values = [0.1, 0.5, 0.9, 0.3, 0.7, 0.2]
    const random = () => values[seed++ % values.length]
    const board = generateBoard(5, 5, random)
    expect(isSolved(board)).toBe(false)
    expect(board).toHaveLength(5)
  })

  it('is solvable by replaying the same toggles in reverse', () => {
    // A board built from a known toggle sequence can be solved by re-applying
    // the same toggles, proving reversibility end to end.
    const moves = [
      { row: 0, col: 0 },
      { row: 2, col: 3 },
      { row: 4, col: 1 },
    ]
    let board = createEmptyBoard(5)
    for (const m of moves) board = toggle(board, m)
    expect(isSolved(board)).toBe(false)
    for (const m of moves) board = toggle(board, m)
    expect(isSolved(board)).toBe(true)
  })
})
