/**
 * Puntos ⇄ bytes para Firestore: cada punto ocupa 5 bytes (x e y como Int16 en décimas de
 * unidad, presión como Uint8 de 0 a 255), unas 4 veces menos que un array de números.
 * Rango: ±3276,7 unidades (la hoja mide 1240 × 1754).
 */
const BYTES_PER_POINT = 5
const LIMIT = 32767

export function encodePoints(pts: ArrayLike<number>): Uint8Array {
  const n = Math.floor(pts.length / 3)
  const out = new Uint8Array(n * BYTES_PER_POINT)
  const view = new DataView(out.buffer)
  for (let i = 0; i < n; i++) {
    const o = i * BYTES_PER_POINT
    view.setInt16(o, quantize(pts[3 * i]), true)
    view.setInt16(o + 2, quantize(pts[3 * i + 1]), true)
    view.setUint8(o + 4, Math.round(Math.min(1, Math.max(0, pts[3 * i + 2])) * 255))
  }
  return out
}

export function decodePoints(bytes: Uint8Array): number[] {
  const n = Math.floor(bytes.length / BYTES_PER_POINT)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const pts = new Array<number>(n * 3)
  for (let i = 0; i < n; i++) {
    const o = i * BYTES_PER_POINT
    pts[3 * i] = view.getInt16(o, true) / 10
    pts[3 * i + 1] = view.getInt16(o + 2, true) / 10
    pts[3 * i + 2] = view.getUint8(o + 4) / 255
  }
  return pts
}

function quantize(v: number): number {
  return Math.max(-LIMIT, Math.min(LIMIT, Math.round(v * 10)))
}
