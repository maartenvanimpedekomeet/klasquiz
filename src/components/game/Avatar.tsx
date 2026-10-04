import type { AvatarData } from '../../types/database'

export const AVATAR_BG: Record<string, string> = {
  yellow: '#fbbf24',
  orange: '#f97316',
  red:    '#ef4444',
  pink:   '#ec4899',
  violet: '#8b5cf6',
  blue:   '#3b82f6',
  green:  '#22c55e',
  teal:   '#14b8a6',
}

const SIZES = {
  xs: { outer: 'w-8 h-8',   face: '18px', hat: '11px', extra: '11px', hatTop: '-8px',  extraBottom: '-6px'  },
  sm: { outer: 'w-10 h-10', face: '22px', hat: '14px', extra: '13px', hatTop: '-10px', extraBottom: '-7px'  },
  md: { outer: 'w-14 h-14', face: '30px', hat: '18px', extra: '16px', hatTop: '-14px', extraBottom: '-8px'  },
  lg: { outer: 'w-20 h-20', face: '44px', hat: '26px', extra: '22px', hatTop: '-20px', extraBottom: '-10px' },
}

export function Avatar({ avatar, size = 'md' }: { avatar: Partial<AvatarData>; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const face  = avatar?.face  || '😀'
  const bg    = AVATAR_BG[avatar?.bg || 'yellow'] ?? AVATAR_BG.yellow
  const hat   = avatar?.hat   || ''
  const extra = avatar?.extra || ''
  const s = SIZES[size]

  return (
    <div
      className={`relative ${s.outer} rounded-full flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: bg }}
    >
      <span style={{ fontSize: s.face, lineHeight: 1 }}>{face}</span>
      {hat && (
        <span style={{ position: 'absolute', top: s.hatTop, left: '50%', transform: 'translateX(-50%)', fontSize: s.hat, lineHeight: 1, pointerEvents: 'none' }}>
          {hat}
        </span>
      )}
      {extra && (
        <span style={{ position: 'absolute', bottom: s.extraBottom, left: '50%', transform: 'translateX(-50%)', fontSize: s.extra, lineHeight: 1, pointerEvents: 'none' }}>
          {extra}
        </span>
      )}
    </div>
  )
}
