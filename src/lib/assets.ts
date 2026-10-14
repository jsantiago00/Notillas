/** Archivos de public/ respetando la ruta base (en GitHub Pages la app vive en /Notillas/). */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`
export const LOGO = asset('logo.svg')
