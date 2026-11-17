import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

type View = 'grid' | 'list'

function Harness() {
  const [value, setValue] = useState<View>('grid')
  return (
    <SegmentedControl
      label="Вид отображения"
      value={value}
      options={[
        { value: 'grid', label: 'Сетка' },
        { value: 'list', label: 'Список' },
      ]}
      onChange={setValue}
    />
  )
}

describe('SegmentedControl', () => {
  it('переключает значение и выставляет aria-pressed', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const grid = screen.getByRole('button', { name: 'Сетка' })
    const list = screen.getByRole('button', { name: 'Список' })

    expect(grid).toHaveAttribute('aria-pressed', 'true')
    expect(list).toHaveAttribute('aria-pressed', 'false')

    await user.click(list)

    expect(grid).toHaveAttribute('aria-pressed', 'false')
    expect(list).toHaveAttribute('aria-pressed', 'true')
  })

  it('работает с клавиатуры по Tab и Enter', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: 'Список' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
