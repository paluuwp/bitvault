import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DropdownMenu } from './DropdownMenu'

const items = [
  { id: 'listen', label: 'Слушать' },
  { id: 'delete', label: 'Удалить', variant: 'danger' as const },
]

const originalInnerHeight = window.innerHeight

function mockMenuItemHeight(height: number) {
  // Меню меряем отдельно от триггера: остальным элементам отдаём rect триггера.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.getAttribute('role') === 'menu') {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 176,
        bottom: height,
        width: 176,
        height,
      }
    }
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
  } as unknown as () => DOMRect)
}

afterEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  vi.restoreAllMocks()
})

describe('DropdownMenu', () => {
  it('показывает все пункты в меню, вынесенном в body', async () => {
    const user = userEvent.setup()
    render(<DropdownMenu label="Действия с треком" items={items} />)

    await user.click(screen.getByRole('button', { name: 'Действия с треком' }))

    const menu = screen.getByRole('menu', { name: 'Действия с треком' })
    // Portal: меню не обрезается контейнером списка.
    expect(menu.parentElement).toBe(document.body)
    expect(screen.getByRole('menuitem', { name: 'Слушать' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeInTheDocument()
  })

  it('связывает триггер с меню через aria-expanded и aria-controls', async () => {
    const user = userEvent.setup()
    render(<DropdownMenu label="Действия с треком" items={items} />)

    const trigger = screen.getByRole('button', { name: 'Действия с треком' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).not.toHaveAttribute('aria-controls')

    await user.click(trigger)

    const menu = screen.getByRole('menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', menu.id)
  })

  it('фокусирует первый пункт, когда меню уже показано', async () => {
    const originalFocus = HTMLElement.prototype.focus
    const menuVisibilityAtFocus: string[] = []
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
      const menu = this.closest?.('[role="menu"]')
      if (menu) menuVisibilityAtFocus.push((menu as HTMLElement).style.visibility)
      originalFocus.call(this)
    })

    const user = userEvent.setup()
    render(<DropdownMenu label="Действия с треком" items={items} />)

    await user.click(screen.getByRole('button', { name: 'Действия с треком' }))

    // Скрытый элемент в браузере фокус не получает — фокус ставим после установки позиции.
    expect(menuVisibilityAtFocus).toEqual([''])
    expect(screen.getByRole('menuitem', { name: 'Слушать' })).toHaveFocus()
  })

  it('перемещает фокус стрелками, Home и End', async () => {
    const user = userEvent.setup()
    render(<DropdownMenu label="Действия с треком" items={items} />)

    await user.click(screen.getByRole('button', { name: 'Действия с треком' }))
    const listen = screen.getByRole('menuitem', { name: 'Слушать' })
    const remove = screen.getByRole('menuitem', { name: 'Удалить' })

    expect(listen).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(remove).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(listen).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(remove).toHaveFocus()

    await user.keyboard('{Home}')
    expect(listen).toHaveFocus()

    await user.keyboard('{End}')
    expect(remove).toHaveFocus()
  })

  it('пропускает недоступные пункты при навигации с клавиатуры', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu
        label="Действия с треком"
        items={[items[0], { id: 'share', label: 'Поделиться', disabled: true }, items[1]]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Действия с треком' }))
    const listen = screen.getByRole('menuitem', { name: 'Слушать' })
    const remove = screen.getByRole('menuitem', { name: 'Удалить' })

    await user.keyboard('{ArrowDown}')
    expect(remove).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(listen).toHaveFocus()
  })

  it('закрывает меню по Tab и оставляет фокус на триггере', async () => {
    const user = userEvent.setup()
    render(<DropdownMenu label="Действия с треком" items={items} />)

    const trigger = screen.getByRole('button', { name: 'Действия с треком' })
    await user.click(trigger)
    const listen = screen.getByRole('menuitem', { name: 'Слушать' })
    expect(listen).toHaveFocus()

    // Портала в DOM больше не будет, поэтому фокус должен вернуться на триггер,
    // а не улететь в начало страницы от исчезнувшего узла.
    fireEvent.keyDown(listen, { key: 'Tab' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('закрывает меню по Shift+Tab и оставляет фокус на триггере', async () => {
    const user = userEvent.setup()
    render(<DropdownMenu label="Действия с треком" items={items} />)

    const trigger = screen.getByRole('button', { name: 'Действия с треком' })
    await user.click(trigger)
    const listen = screen.getByRole('menuitem', { name: 'Слушать' })

    fireEvent.keyDown(listen, { key: 'Tab', shiftKey: true })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('закрывает по Tab меню без доступных для фокуса пунктов', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu
        label="Действия с треком"
        items={[{ id: 'share', label: 'Поделиться', disabled: true }]}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Действия с треком' })
    await user.click(trigger)

    // Фокусировать нечего — он остаётся на триггере.
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(trigger).toHaveFocus()

    fireEvent.keyDown(trigger, { key: 'Tab' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('закрывается по клику вне меню', async () => {
    const user = userEvent.setup()
    render(
      <>
        <DropdownMenu label="Действия с треком" items={items} />
        <button type="button">Снаружи</button>
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Действия с треком' }))
    await user.click(screen.getByRole('button', { name: 'Снаружи' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('закрывается по Escape', async () => {
    const user = userEvent.setup()
    render(<DropdownMenu label="Действия с треком" items={items} />)

    await user.click(screen.getByRole('button', { name: 'Действия с треком' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Действия с треком' })).toHaveFocus()
  })

  it('раскрывается вверх, когда снизу не хватает места', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
    mockMenuItemHeight(200)

    const user = userEvent.setup()
    render(<DropdownMenu label="Действия с треком" items={items} />)

    const trigger = screen.getByRole('button', { name: 'Действия с треком' })
    // Триггер у самого низа окна: 600 − 40 = 560.
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(
      () =>
        ({ x: 900, y: 500, top: 500, left: 900, right: 940, bottom: 540, width: 40, height: 40 }) as DOMRect,
    )

    await user.click(trigger)

    const menu = screen.getByRole('menu')
    // 500 − 4 (зазор) − 200 (высота меню) = 296.
    expect(parseFloat(menu.style.top)).toBe(296)
    expect(parseFloat(menu.style.top) + 200).toBeLessThan(540)
  })

  it('вызывает обработчик и закрывает меню при выборе пункта', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <DropdownMenu
        label="Действия с треком"
        items={[{ id: 'listen', label: 'Слушать', onSelect }]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Действия с треком' }))
    await user.click(screen.getByRole('menuitem', { name: 'Слушать' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
