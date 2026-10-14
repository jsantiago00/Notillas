import type { Recognizer } from '../canvas/Board'
import type { ShapeMeta } from '../model/types'
import type { P } from './geom'
import { adjustShape, recognize, shapeParams, shapePoints } from './index'

/**
 * Conecta el reconocimiento con el lienzo: al quedar quieto el lápiz, el trazo pasa a ser la
 * forma; mientras siga apoyado, la forma se ajusta con él (anclada donde se reconoció).
 */
export const shapeRecognizer: Recognizer = {
  hold(pts) {
    const points: P[] = []
    for (let i = 0; i + 1 < pts.length; i += 3) points.push({ x: pts[i], y: pts[i + 1] })
    const shape = recognize(points)
    if (!shape) return null
    const anchor = points[points.length - 1]
    const meta: ShapeMeta = { kind: shape.kind, params: shapeParams(shape.verts) }
    return {
      pts: shapePoints(shape.verts, shape.closed),
      shape: meta,
      adjust: (x, y) => {
        const verts = adjustShape(shape, anchor, { x, y })
        meta.params = shapeParams(verts)
        return shapePoints(verts, shape.closed)
      },
    }
  },
}
