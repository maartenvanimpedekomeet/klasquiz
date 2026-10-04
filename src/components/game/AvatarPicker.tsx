import type { AvatarData } from '../../types/database'
import { Avatar, AVATAR_BG } from './Avatar'

export const AVATAR_FACES  = ['😀', '😁', '😆', '😜', '🤩', '😎', '🥸', '🤓', '😈', '💀', '🤖', '👻']
export const AVATAR_COLORS = ['yellow', 'orange', 'red', 'pink', 'violet', 'blue', 'green', 'teal']
export const AVATAR_HATS   = ['', '🎩', '👒', '🎓', '🪖', '👑', '🎅']
export const AVATAR_EXTRAS = ['', '🕶️', '👓', '🥸', '🌹', '⚡', '🔥']

const COLOR_LABELS: Record<string, string> = {
  yellow: 'Geel', orange: 'Oranje', red: 'Rood', pink: 'Roze',
  violet: 'Paars', blue: 'Blauw', green: 'Groen', teal: 'Turquoise',
}

interface AvatarPickerProps {
  value: AvatarData
  onChange: (avatar: AvatarData) => void
}

function PickerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-violet-300 uppercase tracking-wider mb-2 font-bold">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function PickBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl p-1.5 transition text-2xl min-w-[2.5rem] flex items-center justify-center ${
        active ? 'bg-white/30 outline outline-2 outline-white' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  )
}

export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  function set(patch: Partial<AvatarData>) {
    onChange({ ...value, ...patch })
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-sm">
      <div className="flex justify-center">
        <Avatar avatar={value} size="lg" />
      </div>

      <PickerRow label="Gezicht">
        {AVATAR_FACES.map(f => (
          <PickBtn key={f} active={value.face === f} onClick={() => set({ face: f })}>{f}</PickBtn>
        ))}
      </PickerRow>

      <PickerRow label="Kleur">
        {AVATAR_COLORS.map(c => (
          <button
            key={c}
            title={COLOR_LABELS[c]}
            onClick={() => set({ bg: c })}
            className="w-9 h-9 rounded-full transition"
            style={{
              backgroundColor: AVATAR_BG[c],
              outline: value.bg === c ? '3px solid white' : '3px solid transparent',
              outlineOffset: '2px',
            }}
          />
        ))}
      </PickerRow>

      <PickerRow label="Hoed">
        {AVATAR_HATS.map((h, i) => (
          <PickBtn key={i} active={value.hat === h} onClick={() => set({ hat: h })}>
            {h || <span className="text-base text-violet-400">✕</span>}
          </PickBtn>
        ))}
      </PickerRow>

      <PickerRow label="Accessoire (zonnebril / snor / ...)">
        {AVATAR_EXTRAS.map((e, i) => (
          <PickBtn key={i} active={value.extra === e} onClick={() => set({ extra: e })}>
            {e || <span className="text-base text-violet-400">✕</span>}
          </PickBtn>
        ))}
      </PickerRow>
    </div>
  )
}
