import { describe, expect, it } from 'vitest'
import { fileName } from './exporters'

describe('fileName', () => {
  it('saca los caracteres que no van en un nombre de archivo', () => {
    expect(fileName('Física: tema 2/3', 'pdf')).toBe('Fisica tema 23.pdf')
    expect(fileName('Año ½ «nuevo»', 'pdf')).toBe('Ano nuevo.pdf')
    expect(fileName('', 'png', '-p1')).toBe('Nota-p1.png')
  })
})
