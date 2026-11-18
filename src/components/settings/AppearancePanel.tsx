import { Check } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui'
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  applyAccent,
  deriveAccentTokens,
  getStoredAccent,
  storeAccent,
} from '@/lib/theme'

export function AppearancePanel() {
  const titleId = useId()
  const customId = useId()
  const [accent, setAccent] = useState<string>(() => getStoredAccent() ?? DEFAULT_ACCENT)

  const select = (hex: string) => {
    const value = hex.toLowerCase()
    setAccent(value)
    applyAccent(value)
    storeAccent(value)
  }

  return (
    <section aria-labelledby={titleId} className="rounded-card border border-white/10 bg-surface p-4">
      <header>
        <h3 id={titleId} className="text-h2 text-text">
          Оформление
        </h3>
        <p className="mt-1 text-caption text-text-muted">
          Акцентный цвет применяется сразу и сохраняется на этом устройстве.
        </p>
      </header>

      <div className="mt-3 flex flex-col gap-3">
        <div
          role="radiogroup"
          aria-label="Акцентный цвет"
          className="flex flex-wrap gap-1"
        >
          {ACCENT_PRESETS.map((preset) => {
            const checked = preset.hex === accent
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={preset.label}
                title={preset.label}
                onClick={() => select(preset.hex)}
                className="flex h-11 w-11 items-center justify-center rounded-full outline-offset-2"
              >
                <span
                  aria-hidden="true"
                  style={{
                    backgroundColor: preset.hex,
                    color: deriveAccentTokens(preset.hex).ink,
                  }}
                  className={
                    checked
                      ? 'flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-text ring-offset-2 ring-offset-surface'
                      : 'flex h-8 w-8 items-center justify-center rounded-full border border-white/20'
                  }
                >
                  {checked && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={customId} className="text-body text-text">
            Свой цвет
          </label>
          <input
            id={customId}
            type="color"
            value={accent}
            onChange={(event) => select(event.target.value)}
            className="h-11 w-14 cursor-pointer rounded-control border border-white/10 bg-transparent p-1"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={accent === DEFAULT_ACCENT}
            onClick={() => select(DEFAULT_ACCENT)}
          >
            Сбросить
          </Button>
        </div>
      </div>
    </section>
  )
}
