import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { loadLocale } from '../i18n'

await Promise.all([loadLocale('fr-FR'), loadLocale('en-US')])

afterEach(() => {
  cleanup()
})
