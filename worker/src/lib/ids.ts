/** Идентификаторы не являются секретами: `<prefix>_<uuid>` достаточно для уникальности. */
export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}
