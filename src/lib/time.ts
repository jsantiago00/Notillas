const rtf = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' })

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]

/** «hace 5 minutos», «ayer», «hace 3 semanas». Menos de un minuto: «recién». */
export function relativeTime(ms: number, now = Date.now()): string {
  let v = (ms - now) / 1000
  if (Math.abs(v) < 60) return 'recién'
  for (const [unit, size] of STEPS) {
    if (Math.abs(v) < size) return rtf.format(Math.round(v), unit)
    v /= size
  }
  return rtf.format(Math.round(v), 'year')
}
