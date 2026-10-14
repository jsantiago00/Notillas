import type { BBox, Background } from '../model/types'

/** Margen superior del rayado (en renglones) y posición del margen rojo (unidades de página). */
const RULED_TOP_LINES = 3
const RULED_MARGIN_X = 150
const MARGIN_COLOR = '#ec9ea6'
/** Por debajo de esta separación en pantalla (px) las líneas no se dibujan; hasta el doble, se atenúan. */
const MIN_SPACING_PX = 4

/** Opacidad de las líneas según cuánto se separan en pantalla: se desvanecen al alejar. */
export function lineAlpha(spacing: number, zoom: number): number {
  const px = spacing * zoom
  return Math.min(1, Math.max(0, (px - MIN_SPACING_PX) / MIN_SPACING_PX))
}

/**
 * Posiciones de las líneas en [from, to] con paso `spacing`, empezando en `start`
 * y sin pasar de `limit`. Solo las que caen en el tramo visible.
 */
export function linePositions(start: number, spacing: number, limit: number, from: number, to: number): number[] {
  const out: number[] = []
  const first = Math.max(0, Math.ceil((from - start) / spacing))
  for (let i = first; ; i++) {
    const v = start + i * spacing
    if (v > to || v > limit) break
    out.push(v)
  }
  return out
}

/** Desplazamiento para centrar la cuadrícula en la hoja (los bordes quedan parejos). */
export function gridOffset(length: number, spacing: number): number {
  return (length % spacing) / 2
}

/**
 * Dibuja el fondo de una página en coordenadas de la página (el contexto ya está
 * transformado). Se usa en pantalla y al exportar.
 * @param zoom píxeles por unidad de página, para el grosor mínimo y el desvanecido
 * @param visible tramo visible en coordenadas de la página (para no dibujar de más)
 */
export function drawPageBackground(
  ctx: CanvasRenderingContext2D,
  bg: Background,
  width: number,
  height: number,
  zoom: number,
  visible: BBox = [0, 0, width, height],
) {
  ctx.fillStyle = bg.paper
  ctx.fillRect(0, 0, width, height)
  if (bg.type === 'blank') return
  const alpha = lineAlpha(bg.spacing, zoom)
  // El margen rojo del rayado se ve aunque el renglón ya no se distinga
  if (bg.type === 'ruled') drawRuled(ctx, bg, width, height, zoom, visible, alpha)
  if (alpha === 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  if (bg.type === 'grid') drawGrid(ctx, bg, width, height, zoom, visible)
  else if (bg.type === 'dots') drawDots(ctx, bg, width, height, zoom, visible)
  ctx.restore()
}

/** Grosor en unidades de página: 1,4 de base, entre 0,75 y 2 px de pantalla (no engorda al acercar). */
function lineWidth(zoom: number): number {
  return Math.max(Math.min(1.4, 2 / zoom), 0.75 / zoom)
}

function drawRuled(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number, zoom: number, v: BBox, alpha: number) {
  const lw = lineWidth(zoom)
  if (alpha > 0) {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = bg.color
    ctx.lineWidth = lw
    ctx.beginPath()
    for (const y of linePositions(bg.spacing * RULED_TOP_LINES, bg.spacing, h - bg.spacing / 2, v[1], v[3])) {
      ctx.moveTo(Math.max(0, v[0]), y)
      ctx.lineTo(Math.min(w, v[2]), y)
    }
    ctx.stroke()
    ctx.restore()
  }
  if (RULED_MARGIN_X >= v[0] && RULED_MARGIN_X <= v[2]) {
    ctx.strokeStyle = MARGIN_COLOR
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(RULED_MARGIN_X, Math.max(0, v[1]))
    ctx.lineTo(RULED_MARGIN_X, Math.min(h, v[3]))
    ctx.stroke()
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number, zoom: number, v: BBox) {
  const s = bg.spacing
  ctx.strokeStyle = bg.color
  ctx.lineWidth = lineWidth(zoom)
  ctx.beginPath()
  const y0 = Math.max(0, v[1])
  const y1 = Math.min(h, v[3])
  const x0 = Math.max(0, v[0])
  const x1 = Math.min(w, v[2])
  for (const x of linePositions(gridOffset(w, s), s, w, v[0], v[2])) {
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y1)
  }
  for (const y of linePositions(gridOffset(h, s), s, h, v[1], v[3])) {
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
  }
  ctx.stroke()
}

function drawDots(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number, zoom: number, v: BBox) {
  const s = bg.spacing
  // Radio de 1,6 unidades, entre 0,9 y 2,5 px de pantalla
  const r = Math.max(Math.min(1.6, 2.5 / zoom), 0.9 / zoom)
  ctx.fillStyle = bg.color
  ctx.beginPath()
  const xs = linePositions(gridOffset(w, s), s, w, v[0] - r, v[2] + r)
  for (const y of linePositions(gridOffset(h, s), s, h, v[1] - r, v[3] + r)) {
    for (const x of xs) {
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
    }
  }
  ctx.fill()
}
