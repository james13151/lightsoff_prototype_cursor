import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('<App />', () => {
  it('renders the board and title', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /lights off/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('grid')).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(25)
  })

  it('increments the move counter when a cell is pressed', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByTestId('move-count')).toHaveTextContent('0')
    await user.click(screen.getAllByRole('gridcell')[0])
    expect(screen.getByTestId('move-count')).toHaveTextContent('1')
  })

  it('resets the move counter on new game', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getAllByRole('gridcell')[0])
    expect(screen.getByTestId('move-count')).toHaveTextContent('1')
    await user.click(screen.getByRole('button', { name: /new game/i }))
    expect(screen.getByTestId('move-count')).toHaveTextContent('0')
  })

  it('does not show the win banner while lights remain on', () => {
    render(<App />)
    // The generated puzzle always starts unsolved (at least one light on).
    expect(Number(screen.getByTestId('lit-count').textContent)).toBeGreaterThan(
      0,
    )
    expect(screen.queryByTestId('win-message')).not.toBeInTheDocument()
  })
})
