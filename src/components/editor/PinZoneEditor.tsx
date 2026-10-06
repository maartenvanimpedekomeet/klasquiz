import { useRef } from 'react'

interface Point { x: number; y: number }
interface Props {
  imageUrl: string
  polygon: Point[]
  onChange: (polygon: Point[]) => void
}

export function PinZoneEditor({ imageUrl, polygon, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    // Use clientWidth/clientHeight (excludes border) for accurate coordinates
    const w = containerRef.current.clientWidth
    const h = containerRef.current.clientHeight
    const style = getComputedStyle(containerRef.current)
    const bl = parseFloat(style.borderLeftWidth)
    const bt = parseFloat(style.borderTopWidth)
    const x = Math.round(((e.clientX - rect.left - bl) / w) * 1000) / 10
    const y = Math.round(((e.clientY - rect.top - bt) / h) * 1000) / 10
    onChange([...polygon, { x, y }])
  }

  function removePoint(i: number, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(polygon.filter((_, idx) => idx !== i))
  }

  const closed = polygon.length >= 3
  const pointsStr = polygon.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Klik op de afbeelding om zone-punten te plaatsen. Klik op een punt om het te verwijderen. Minstens 3 punten.
        </p>
        {polygon.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-xs text-red-500 hover:text-red-700 cursor-pointer whitespace-nowrap ml-3"
          >
            Reset zone
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative cursor-crosshair rounded-xl overflow-hidden border-2 border-dashed border-violet-400 bg-gray-100"
        style={{ userSelect: 'none' }}
        onClick={handleClick}
      >
        <img
          src={imageUrl}
          alt=""
          className="w-full block"
          draggable={false}
          style={{ pointerEvents: 'none' }}
        />
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ pointerEvents: 'none' }}
        >
          {/* Filled polygon */}
          {closed && (
            <polygon
              points={pointsStr}
              fill="rgba(139, 92, 246, 0.2)"
              stroke="rgba(139, 92, 246, 0.8)"
              strokeWidth="0.4"
              strokeDasharray="2,1"
            />
          )}
          {/* Lines */}
          {polygon.length >= 2 && polygon.map((p, i) => {
            if (i === 0) return null
            const prev = polygon[i - 1]
            return (
              <line key={i} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y}
                stroke="rgba(139, 92, 246, 0.8)" strokeWidth="0.4" />
            )
          })}
          {/* Closing line preview */}
          {closed && (
            <line x1={polygon[polygon.length - 1].x} y1={polygon[polygon.length - 1].y}
              x2={polygon[0].x} y2={polygon[0].y}
              stroke="rgba(139, 92, 246, 0.5)" strokeWidth="0.4" strokeDasharray="1,1" />
          )}
        </svg>
        {/* Points (rendered as HTML for pointer events) */}
        {polygon.map((p, i) => (
          <div
            key={i}
            className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 bg-violet-600 border-2 border-white rounded-full cursor-pointer hover:bg-red-500 transition-colors z-10 flex items-center justify-center"
            style={{ left: `${p.x}%`, top: `${p.y}%`, pointerEvents: 'all' }}
            onClick={e => removePoint(i, e)}
            title="Klik om te verwijderen"
          >
            <span className="text-white text-xs font-bold leading-none">{i + 1}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        {polygon.length} punt{polygon.length !== 1 ? 'en' : ''}
        {closed ? <span className="text-green-600 font-medium"> — zone actief ✓</span> : <span className="text-amber-500"> — voeg nog {3 - polygon.length} punt{3 - polygon.length !== 1 ? 'en' : ''} toe</span>}
      </p>
    </div>
  )
}
