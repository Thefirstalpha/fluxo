import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from './csp'

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((part) => {
      const [name = '', ...values] = part.trim().split(/\s+/)
      return [name, values]
    }),
  )
}

describe('buildContentSecurityPolicy — production', () => {
  const csp = directives(buildContentSecurityPolicy())

  it('refuse tout par défaut', () => {
    expect(csp.get('default-src')).toEqual(["'none'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('frame-ancestors')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'none'"])
  })

  it('interdit les scripts inline et eval', () => {
    expect(csp.get('script-src')).toEqual(["'self'"])
    expect([...csp.values()].flat()).not.toContain("'unsafe-eval'")
  })

  it('interdit au renderer tout accès réseau', () => {
    expect(csp.get('connect-src')).toEqual(["'self'"])
    expect([...csp.values()].flat().some((value) => value.startsWith('http'))).toBe(false)
  })

  it("n'autorise l'inline que pour les attributs style", () => {
    expect(csp.get('style-src')).toEqual(["'self'"])
    expect(csp.get('style-src-attr')).toEqual(["'unsafe-inline'"])
  })
})

describe('buildContentSecurityPolicy — développement', () => {
  it('autorise uniquement le serveur Vite local (HTTP + WebSocket HMR)', () => {
    const csp = directives(buildContentSecurityPolicy({ devServerOrigin: 'http://localhost:5173' }))
    expect(csp.get('connect-src')).toEqual([
      "'self'",
      'http://localhost:5173',
      'ws://localhost:5173',
    ])
    expect(csp.get('script-src')).toContain("'unsafe-inline'")
    expect([...csp.values()].flat()).not.toContain("'unsafe-eval'")
  })
})
