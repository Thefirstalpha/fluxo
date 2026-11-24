import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { loadSettingsFile, saveSettingsFile } from './settings-file'

let directory: string
let file: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fluxo-settings-'))
  file = join(directory, 'settings.json')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('settings-file', () => {
  it('utilise les valeurs par défaut si le fichier est absent', async () => {
    await expect(loadSettingsFile(file)).resolves.toEqual({
      settings: DEFAULT_SETTINGS,
      status: 'missing',
    })
  })

  it('relit exactement ce qui a été écrit, sans fichier temporaire résiduel', async () => {
    const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, hideAmounts: true }
    await saveSettingsFile(file, settings)
    await expect(loadSettingsFile(file)).resolves.toEqual({ settings, status: 'loaded' })
    expect(await readdir(directory)).toEqual(['settings.json'])
  })

  it('met de côté un fichier corrompu au lieu de l’écraser', async () => {
    await writeFile(file, '{ pas du json', 'utf8')
    const result = await loadSettingsFile(file)
    expect(result).toEqual({ settings: DEFAULT_SETTINGS, status: 'recovered' })
    const files = await readdir(directory)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^settings\.json\.corrupt-\d+$/)
    await expect(readFile(join(directory, files[0] ?? ''), 'utf8')).resolves.toBe('{ pas du json')
  })
})
