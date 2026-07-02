import { useCallback, useMemo, useState } from 'react'
import {
  countLit,
  generateBoard,
  isSolved,
  toggle,
  type Board,
  type Position,
} from './game/lightsOff'
import './App.css'

const BOARD_SIZE = 5
const SHUFFLE_MOVES = 8

export default function App() {
  const [board, setBoard] = useState<Board>(() =>
    generateBoard(BOARD_SIZE, SHUFFLE_MOVES),
  )
  const [moves, setMoves] = useState(0)

  const solved = useMemo(() => isSolved(board), [board])
  const lit = useMemo(() => countLit(board), [board])

  const handlePress = useCallback(
    (pos: Position) => {
      if (isSolved(board)) return
      setBoard((prev) => toggle(prev, pos))
      setMoves((m) => m + 1)
    },
    [board],
  )

  const handleNewGame = useCallback(() => {
    setBoard(generateBoard(BOARD_SIZE, SHUFFLE_MOVES))
    setMoves(0)
  }, [])

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Lights Off</h1>
        <p className="app__subtitle">
          Turn every light off. Pressing a tile also flips its neighbours.
        </p>
      </header>

      <section className="stats" aria-live="polite">
        <div className="stats__item">
          <span className="stats__label">Moves</span>
          <span className="stats__value" data-testid="move-count">
            {moves}
          </span>
        </div>
        <div className="stats__item">
          <span className="stats__label">Lit</span>
          <span className="stats__value" data-testid="lit-count">
            {lit}
          </span>
        </div>
      </section>

      <div
        className={`board ${solved ? 'board--solved' : ''}`}
        role="grid"
        aria-label="Lights Off board"
      >
        {board.map((row, r) => (
          <div className="board__row" role="row" key={r}>
            {row.map((on, c) => (
              <button
                key={`${r}-${c}`}
                type="button"
                role="gridcell"
                aria-label={`Light row ${r + 1} column ${c + 1} ${
                  on ? 'on' : 'off'
                }`}
                aria-pressed={on}
                className={`cell ${on ? 'cell--on' : 'cell--off'}`}
                onClick={() => handlePress({ row: r, col: c })}
              />
            ))}
          </div>
        ))}
      </div>

      {solved && (
        <p className="win" role="status" data-testid="win-message">
          You solved it in {moves} {moves === 1 ? 'move' : 'moves'}!
        </p>
      )}

      <button type="button" className="new-game" onClick={handleNewGame}>
        New game
      </button>
    </main>
  )
}
