/**
 * Разбирает ALLOWED_EMAILS: список через запятую, trim, нижний регистр, без дублей.
 * Пустой список возвращает [] — вход запрещён всем (fail closed).
 */
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const item of raw.split(',')) {
    const email = item.trim().toLowerCase()
    if (email.length > 0) seen.add(email)
  }
  return [...seen]
}

/** Проверяет e-mail по белому списку без учёта регистра и окружающих пробелов. */
export function isEmailAllowed(email: string, raw: string | undefined): boolean {
  const normalized = email.trim().toLowerCase()
  if (normalized.length === 0) return false
  const allowlist = parseAllowlist(raw)
  if (allowlist.length === 0) return false
  return allowlist.includes(normalized)
}
