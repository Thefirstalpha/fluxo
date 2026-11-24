import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl, matchesOrigin } from './url'

describe('matchesOrigin', () => {
  const app = { protocol: 'app:', host: 'fluxo' }

  it('reconnaît le protocole privé de l’application', () => {
    expect(matchesOrigin('app://fluxo/index.html#/settings', app)).toBe(true)
  })

  it.each([
    'app://evil/index.html',
    'https://fluxo/index.html',
    'file:///C:/fluxo/index.html',
    'app://fluxo.evil.com/',
    'not a url',
  ])('refuse %s', (url) => {
    expect(matchesOrigin(url, app)).toBe(false)
  })

  it('distingue les ports du serveur de développement', () => {
    const dev = { protocol: 'http:', host: 'localhost:5173' }
    expect(matchesOrigin('http://localhost:5173/src/main.tsx', dev)).toBe(true)
    expect(matchesOrigin('http://localhost:5174/', dev)).toBe(false)
  })
})

describe('isAllowedExternalUrl', () => {
  const hosts = ['github.com']

  it.each(['https://github.com/Thefirstalpha/fluxo', 'https://docs.github.com/fr'])(
    'autorise %s',
    (url) => {
      expect(isAllowedExternalUrl(url, hosts)).toBe(true)
    },
  )

  it.each([
    'http://github.com/Thefirstalpha/fluxo',
    'https://github.com.evil.com/',
    'https://evilgithub.com/',
    'https://user:pass@github.com/',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'ms-settings:privacy',
    '',
  ])('refuse %s', (url) => {
    expect(isAllowedExternalUrl(url, hosts)).toBe(false)
  })
})
