/**
 * Analyseur XML minimal et strict sans dépendance externe :
 * - refuse `<!DOCTYPE` et `<!ENTITY` (aucune attaque XXE ni expansion « billion laughs ») ;
 * - borne la profondeur d'imbrication et le nombre de nœuds ;
 * - n'accepte que les 5 entités prédéfinies et les références numériques valides.
 */

export class UnsafeXmlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeXmlError'
  }
}

export class MalformedXmlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MalformedXmlError'
  }
}

export interface XmlNode {
  name: string
  attributes: Record<string, string>
  children: XmlNode[]
  text: string
}

const MAX_DEPTH = 64
const MAX_NODES = 1_500_000

function stripPrefix(tagName: string): string {
  const colon = tagName.indexOf(':')
  return colon >= 0 ? tagName.slice(colon + 1) : tagName
}

function isValidUnicodeCodePoint(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return true
  if (cp >= 0x20 && cp <= 0xd7ff) return true
  if (cp >= 0xe000 && cp <= 0xfffd) return true
  return cp >= 0x10000 && cp <= 0x10ffff
}

export function decodeXmlEntities(raw: string): string {
  if (!raw.includes('&')) return raw
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity: string) => {
    switch (entity) {
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'amp':
        return '&'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
      default: {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
          const cp = Number.parseInt(entity.slice(2), 16)
          if (Number.isInteger(cp) && isValidUnicodeCodePoint(cp)) return String.fromCodePoint(cp)
        } else if (entity.startsWith('#')) {
          const cp = Number.parseInt(entity.slice(1), 10)
          if (Number.isInteger(cp) && isValidUnicodeCodePoint(cp)) return String.fromCodePoint(cp)
        }
        throw new UnsafeXmlError(`Entité XML non autorisée : ${full}`)
      }
    }
  })
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = Object.create(null) as Record<string, string>
  const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = attrRe.exec(raw)) !== null) {
    const key = match[1]!
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    const val = match[2] ?? match[3] ?? ''
    attrs[key] = decodeXmlEntities(val)
  }
  return attrs
}

export function parseSafeXml(xmlText: string): XmlNode {
  if (/<!(?:DOCTYPE|ENTITY|ELEMENT|ATTLIST|NOTATION)\b/i.test(xmlText)) {
    throw new UnsafeXmlError('Déclaration DOCTYPE ou ENTITY interdite')
  }

  const stack: XmlNode[] = []
  let root: XmlNode | null = null
  let nodeCount = 0
  let pos = 0
  const len = xmlText.length

  while (pos < len) {
    const lt = xmlText.indexOf('<', pos)
    if (lt < 0) break

    if (lt > pos && stack.length > 0) {
      const top = stack[stack.length - 1]!
      const slice = xmlText.slice(pos, lt)
      if (slice.trim() || top.text) {
        top.text += decodeXmlEntities(slice)
      }
    }

    if (xmlText.startsWith('<!--', lt)) {
      const end = xmlText.indexOf('-->', lt + 4)
      if (end < 0) throw new MalformedXmlError('Commentaire XML non fermé')
      pos = end + 3
      continue
    }

    if (xmlText.startsWith('<?', lt)) {
      const end = xmlText.indexOf('?>', lt + 2)
      if (end < 0) throw new MalformedXmlError('Instruction de traitement non fermée')
      pos = end + 2
      continue
    }

    if (xmlText.startsWith('<![CDATA[', lt)) {
      const end = xmlText.indexOf(']]>', lt + 9)
      if (end < 0) throw new MalformedXmlError('Section CDATA non fermée')
      if (stack.length > 0) {
        stack[stack.length - 1]!.text += xmlText.slice(lt + 9, end)
      }
      pos = end + 3
      continue
    }

    // Fin de balise
    if (xmlText.startsWith('</', lt)) {
      const gt = xmlText.indexOf('>', lt + 2)
      if (gt < 0) throw new MalformedXmlError('Balise fermante non terminée')
      const closeName = stripPrefix(xmlText.slice(lt + 2, gt).trim())
      const popped = stack.pop()
      if (!popped || popped.name !== closeName) {
        throw new MalformedXmlError(`Balise fermante inattendue : </${closeName}>`)
      }
      pos = gt + 1
      continue
    }

    // Balise ouvrante ou auto-fermante
    const gt = findTagClose(xmlText, lt + 1)
    if (gt < 0) throw new MalformedXmlError('Balise ouvrante non terminée')
    const rawInside = xmlText.slice(lt + 1, gt).trim()
    const selfClosing = rawInside.endsWith('/')
    const body = selfClosing ? rawInside.slice(0, -1).trimEnd() : rawInside
    const spaceIdx = body.search(/[\s]/)
    const rawTagName = spaceIdx >= 0 ? body.slice(0, spaceIdx) : body
    if (!/^[A-Za-z_][\w:.-]*$/.test(rawTagName)) {
      throw new MalformedXmlError(`Nom de balise invalide : ${rawTagName}`)
    }
    const name = stripPrefix(rawTagName)
    const attrsRaw = spaceIdx >= 0 ? body.slice(spaceIdx + 1) : ''

    nodeCount++
    if (nodeCount > MAX_NODES) throw new UnsafeXmlError('Arbre XML trop volumineux')

    const node: XmlNode = {
      name,
      attributes: attrsRaw ? parseAttributes(attrsRaw) : {},
      children: [],
      text: '',
    }

    if (stack.length === 0) {
      if (root !== null) throw new MalformedXmlError('Racines XML multiples')
      root = node
    } else {
      stack[stack.length - 1]!.children.push(node)
    }

    if (!selfClosing) {
      if (stack.length + 1 > MAX_DEPTH) {
        throw new UnsafeXmlError('Profondeur XML maximale dépassée')
      }
      stack.push(node)
    }
    pos = gt + 1
  }

  if (stack.length > 0 || !root) {
    throw new MalformedXmlError('Document XML incomplet')
  }
  return root
}

function findTagClose(text: string, start: number): number {
  let quote: '"' | "'" | null = null
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '>') {
      return i
    }
  }
  return -1
}

export function findChild(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((child) => child.name === name)
}

export function findChildren(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((child) => child.name === name) : []
}

export function childText(node: XmlNode | undefined, ...path: string[]): string | null {
  let current = node
  if (!current) return null
  for (const segment of path) {
    current = findChild(current, segment)
    if (!current) return null
  }
  const trimmed = current.text.trim()
  return trimmed.length > 0 ? trimmed : null
}
