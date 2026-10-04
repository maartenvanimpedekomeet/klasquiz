import { useEffect, useRef } from 'react'

interface Particle {
  x: number; y: number; vx: number; vy: number
  color: string; alpha: number; size: number; gravity: number
}

const COLORS = ['#fbbf24', '#f87171', '#60a5fa', '#34d399', '#a78bfa', '#f472b6', '#fff']

function randomBetween(a: number, b: number) { return a + Math.random() * (b - a) }

export function Fireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const particles: Particle[] = []

    function burst(x: number, y: number) {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)]
      for (let i = 0; i < 60; i++) {
        const angle = (Math.PI * 2 * i) / 60 + randomBetween(-0.1, 0.1)
        const speed = randomBetween(2, 8)
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          alpha: 1,
          size: randomBetween(3, 6),
          gravity: randomBetween(0.05, 0.15),
        })
      }
    }

    // Fire bursts at random intervals
    const intervals: ReturnType<typeof setInterval>[] = []
    const launchBurst = () => {
      burst(
        randomBetween(canvas.width * 0.15, canvas.width * 0.85),
        randomBetween(canvas.height * 0.1, canvas.height * 0.5),
      )
    }
    launchBurst()
    launchBurst()
    intervals.push(setInterval(launchBurst, 600))

    let animId: number
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.vy += p.gravity
        p.vx *= 0.98
        p.alpha -= 0.018
        if (p.alpha <= 0) { particles.splice(i, 1); continue }
        ctx.save()
        ctx.globalAlpha = p.alpha
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      intervals.forEach(clearInterval)
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50" />
}
