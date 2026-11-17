import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TempoKeyModule } from './TempoKeyModule'

describe('TempoKeyModule', () => {
  it('показывает BPM и KEY текущего трека', () => {
    render(<TempoKeyModule bpm={140} musicalKey="F#m" />)

    expect(screen.getByRole('group', { name: '140 BPM, тональность F#m' })).toBeInTheDocument()
    expect(screen.getByText('BPM')).toBeInTheDocument()
    expect(screen.getByText('Key')).toBeInTheDocument()
    expect(screen.getByText('140')).toBeInTheDocument()
    expect(screen.getByText('F#m')).toBeInTheDocument()
  })

  it('без трека показывает прочерки', () => {
    render(<TempoKeyModule bpm={null} musicalKey={null} />)

    expect(
      screen.getByRole('group', { name: 'Темп не указан, тональность не указана' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })
})
