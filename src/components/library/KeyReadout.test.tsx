import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeyReadout } from './KeyReadout'

describe('KeyReadout', () => {
  it('показывает BPM и тональность рядом', () => {
    render(<KeyReadout bpm={140} musicalKey="F#m" />)

    expect(screen.getByRole('group', { name: '140 BPM, тональность F#m' })).toBeInTheDocument()
    expect(screen.getByText('140')).toBeInTheDocument()
    expect(screen.getByText('F#m')).toBeInTheDocument()
  })

  it('для пустых значений ставит прочерки и не теряет подпись', () => {
    render(<KeyReadout bpm={null} musicalKey={null} />)

    expect(
      screen.getByRole('group', { name: 'Темп не указан, тональность не указана' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })
})
