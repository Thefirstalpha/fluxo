import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveInsideRoot } from './paths'

const root = resolve('/srv/fluxo/renderer')

describe('resolveInsideRoot', () => {
  it('sert index.html pour la racine', () => {
    expect(resolveInsideRoot(root, '/')).toBe(join(root, 'index.html'))
    expect(resolveInsideRoot(root, '')).toBe(join(root, 'index.html'))
  })

  it('résout les fichiers de la build', () => {
    expect(resolveInsideRoot(root, '/assets/index-abc.js')).toBe(
      join(root, 'assets', 'index-abc.js'),
    )
    expect(resolveInsideRoot(root, '/assets/Inter%20Variable.woff2')).toBe(
      join(root, 'assets', 'Inter Variable.woff2'),
    )
  })

  it.each([
    '/../secret.txt',
    '/assets/../../secret.txt',
    '/%2e%2e/secret.txt',
    '/..%2fsecret.txt',
    '/..%5csecret.txt',
    '/assets/%2e%2e%2f%2e%2e%2fsecret.txt',
    '/index.html%00.png',
    '/%E0%A4%A',
  ])('refuse la tentative « %s »', (attempt) => {
    expect(resolveInsideRoot(root, attempt)).toBeNull()
  })

  it('refuse un chemin absolu ou un autre lecteur', () => {
    expect(resolveInsideRoot(root, '/C:/Windows/win.ini')).toBeNull()
    expect(resolveInsideRoot(root, '//etc/passwd')).not.toBe('/etc/passwd')
  })
})
