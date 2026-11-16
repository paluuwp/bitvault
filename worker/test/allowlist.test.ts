import { describe, expect, it } from 'vitest'
import { isEmailAllowed, parseAllowlist } from '../src/lib/allowlist'

describe('ALLOWED_EMAILS', () => {
  it('сравнивает без учёта регистра и окружающих пробелов', () => {
    const raw = ' a@b.COM , C@d.com '
    expect(isEmailAllowed('A@B.com', raw)).toBe(true)
    expect(isEmailAllowed('  a@b.com  ', raw)).toBe(true)
    expect(isEmailAllowed('c@D.COM', raw)).toBe(true)
    expect(isEmailAllowed('x@y.com', raw)).toBe(false)
  })

  it('пустой или отсутствующий список запрещает всех (fail closed)', () => {
    expect(isEmailAllowed('a@b.com', undefined)).toBe(false)
    expect(isEmailAllowed('a@b.com', '')).toBe(false)
    expect(isEmailAllowed('a@b.com', '   ')).toBe(false)
    expect(isEmailAllowed('a@b.com', ' , , ')).toBe(false)
  })

  it('пустой e-mail не разрешается', () => {
    expect(isEmailAllowed('', 'a@b.com')).toBe(false)
    expect(isEmailAllowed('   ', 'a@b.com')).toBe(false)
  })

  it('parseAllowlist нормализует значения и убирает дубли', () => {
    expect(parseAllowlist(' A@B.com , a@b.com ,, C@D.com ')).toEqual(['a@b.com', 'c@d.com'])
    expect(parseAllowlist(undefined)).toEqual([])
  })
})
