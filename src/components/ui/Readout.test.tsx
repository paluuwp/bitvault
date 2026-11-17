import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Readout } from './Readout'

describe('Readout', () => {
  it('показывает пары подпись/значение и доступную сводку', () => {
    render(
      <Readout
        items={[
          { label: 'BPM', value: '140' },
          { label: 'KEY', value: 'F#m' },
        ]}
      />,
    )

    expect(screen.getByRole('group', { name: 'BPM 140, KEY F#m' })).toBeInTheDocument()
    expect(screen.getByText('BPM')).toBeInTheDocument()
    expect(screen.getByText('140')).toBeInTheDocument()
    expect(screen.getByText('F#m')).toBeInTheDocument()
  })

  it('использует явную подпись группы', () => {
    render(
      <Readout
        label="Темп и тональность"
        items={[
          { label: 'BPM', value: '—' },
          { label: 'KEY', value: '—' },
        ]}
      />,
    )

    expect(screen.getByRole('group', { name: 'Темп и тональность' })).toBeInTheDocument()
  })
})
