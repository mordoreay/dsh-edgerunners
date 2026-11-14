// Сверка с оригинальным репозиторием мода, перенос новых кадров и автопорт данных:
// из hooks/animation.ts берутся клипы, из hooks/deeds.ts — реплики, из hooks/characters.ts — герои.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { gunzipSync } from 'node:zlib'

const RAW = 'https://raw.githubusercontent.com/Alexanderadon/edgerunners/main'
const TARBALL = 'https://codeload.github.com/Alexanderadon/edgerunners/tar.gz/refs/heads/main'
const PET_HEROES = new Set(['kadr', 'talia', 'di', 'wick'])
const MAX_ARCHIVE = 256 * 1024 * 1024
const ASSET = /^[^/]+\/assets\/(pet\/([a-z]{2,8})\/[^/]+\.png|sounds\/[^/]+\.(?:wav|mp3|m4a))$/
const MAX_STEPS = 240
const MAX_LINE = 240
const FRAME = /^[a-z0-9_]{1,24}$/i

// Ритм клипов из мода: те же помощники, что в hooks/animation.ts.
const FILM = [260, 180, 230, 180, 220, 180, 230, 180].map((ms, i) => [`film_0${i + 1}`, ms])
const even = (name, count, ms) => Array.from({ length: count }, (_, i) => [`${name}_0${i + 1}`, ms])
const ease = (name, count, slow, fast, back = false, first) => {
  const frames = Array.from({ length: count }, (_, i) => `${name}_0${i + 1}`)
  return (back ? frames.reverse() : frames).map((frame, i) => {
    const ms = Math.round(slow - (slow - fast) * Math.sin((Math.PI * i) / (count - 1)))
    return i === 0 && first ? [frame, ms, first] : [frame, ms]
  })
}

export function isNewer(remote, local) {
  const parse = (value) => String(value || '0').split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0)
  const a = parse(remote)
  const b = parse(local)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] || 0
    const right = b[i] || 0
    if (left !== right) return left > right
  }
  return false
}

export async function remoteVersion(signal) {
  const response = await fetch(`${RAW}/.claude-plugin/plugin.json`, {
    signal,
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`GitHub ответил ${response.status}`)
  const data = await response.json()
  const version = String(data && data.version ? data.version : '')
  if (!version) throw new Error('В plugin.json нет версии')
  return version
}

// --- разбор TS-исходников без запуска их кода в общем контексте -----------

const skipString = (source, index) => {
  const quote = source[index]
  for (let i = index + 1; i < source.length; i += 1) {
    if (source[i] === '\\') { i += 1; continue }
    if (source[i] === quote) return i
  }
  return source.length
}

/** Возвращает сбалансированный литерал объекта/массива, начиная с index. */
function scanBalanced(source, index) {
  const open = source[index]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  for (let i = index; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(source, i); continue }
    if (ch === '/' && source[i + 1] === '/') { const nl = source.indexOf('\n', i); i = nl < 0 ? source.length : nl; continue }
    if (ch === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i); i = end < 0 ? source.length : end + 1; continue }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return source.slice(index, i + 1)
    }
  }
  return null
}

function takeLiteral(source, marker, open = '{') {
  const at = source.indexOf(marker)
  if (at < 0) return null
  // Тип может стоять до знака «=»: `const HEROES: readonly Hero[] = [` — берём литерал после него.
  const eq = source.indexOf('=', at)
  if (eq < 0) return null
  const start = source.indexOf(open, eq)
  if (start < 0) return null
  return scanBalanced(source, start)
}

const MAX_LITERAL = 4 * 1024 * 1024
const MAX_SOURCE = 8 * 1024 * 1024
const BANNED = /\b(constructor|__proto__|prototype|process|require|globalThis|eval|Function|import)\b/

// Помощники объявляются ВНУТРИ песочницы: объекты хоста в контекст не передаются,
// поэтому классический побег через `x.constructor.constructor` не дотягивается до process.
const BOOTSTRAP = `
const FILM = [260, 180, 230, 180, 220, 180, 230, 180].map((ms, i) => ['film_0' + (i + 1), ms]);
const even = (name, count, ms) => Array.from({ length: count }, (_, i) => [name + '_0' + (i + 1), ms]);
const ease = (name, count, slow, fast, back, first) => {
  const frames = Array.from({ length: count }, (_, i) => name + '_0' + (i + 1));
  return (back ? frames.reverse() : frames).map((frame, i) => {
    const ms = Math.round(slow - (slow - fast) * Math.sin((Math.PI * i) / (count - 1)));
    return i === 0 && first ? [frame, ms, first] : [frame, ms];
  });
};
const RULES = '';
const ROMAN = null, TALIA = null, DI = null, WICK = null;
`

/**
 * Разбор литерала в изолированном контексте: без объектов хоста, без генерации кода
 * из строк (new Function/eval запрещены), с таймаутом и проверкой подозрительных слов.
 */
function evaluate(expression) {
  if (typeof expression !== 'string' || !expression.length || expression.length > MAX_LITERAL) {
    throw new Error('Литерал пуст или слишком большой')
  }
  if (BANNED.test(expression)) throw new Error('В литерале найдены запрещённые конструкции')
  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
  })
  return vm.runInContext(`'use strict';\n${BOOTSTRAP}\n(${expression})`, context, { timeout: 1500 })
}

const cleanSteps = (steps) => {
  if (!Array.isArray(steps)) return null
  const out = []
  for (const step of steps.slice(0, MAX_STEPS)) {
    if (!Array.isArray(step)) return null
    const [frame, ms, fx] = step
    if (typeof frame !== 'string' || !FRAME.test(frame)) return null
    const duration = Number(ms)
    if (!Number.isFinite(duration) || duration < 10 || duration > 60_000) return null
    out.push(fx === 'hop' || fx === 'shake' ? [frame, Math.round(duration), fx] : [frame, Math.round(duration)])
  }
  return out.length ? out : null
}

const cleanClip = (clip) => {
  if (!clip || typeof clip !== 'object') return null
  const steps = cleanSteps(clip.steps)
  if (!steps) return null
  const out = { steps }
  if (clip.loop === true) out.loop = true
  if (clip.overlay === 'zzz' || clip.overlay === 'question' || clip.overlay === 'bang') out.overlay = clip.overlay
  if (typeof clip.posture === 'string') out.posture = clip.posture
  return out
}

function cleanClips(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const [name, clip] of Object.entries(value)) {
    if (!/^[a-zA-Z]{1,24}$/.test(name)) continue
    const clean = cleanClip(clip)
    if (clean) out[name] = clean
  }
  return out
}

function cleanHeroClips(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const [hero, clips] of Object.entries(value)) {
    if (!PET_HEROES.has(hero) || !clips || typeof clips !== 'object') continue
    const clean = cleanClips(clips)
    if (Object.keys(clean).length) out[hero] = clean
  }
  return out
}

function parseVoiceBody(body) {
  const out = {}
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const at = line.indexOf(':')
    if (at <= 0) continue
    const key = line.slice(0, at).trim()
    if (!/^[a-z]{2,16}$/.test(key)) continue
    const values = line.slice(at + 1).split('|').map((one) => one.trim()).filter(Boolean)
    if (values.length) out[key] = values.slice(0, 8).map((one) => one.slice(0, MAX_LINE))
  }
  return out
}

function parseVoices(source, constName) {
  const block = takeLiteral(source, `const ${constName}`)
  if (!block) return {}
  const out = {}
  const re = /([A-Za-z_$][\w$]*)\s*:\s*voice\(`([\s\S]*?)`\s*\)/g
  let match
  while ((match = re.exec(block))) out[match[1]] = parseVoiceBody(match[2])
  return out
}

const stringList = (value, limit = 12) => (Array.isArray(value)
  ? value.filter((item) => typeof item === 'string').slice(0, limit).map((item) => item.slice(0, MAX_LINE))
  : [])

function cleanHeroes(value) {
  const out = {}
  if (!Array.isArray(value)) return out
  for (const hero of value) {
    if (!hero || typeof hero !== 'object') continue
    const id = String(hero.id || '')
    if (!PET_HEROES.has(id)) continue
    const lines = hero.lines && typeof hero.lines === 'object' ? hero.lines : {}
    out[id] = {
      name: String(hero.name || '').slice(0, 40),
      role: String(hero.role || '').slice(0, 40),
      lines: {
        idle: stringList(lines.idle),
        think: stringList(lines.think),
        work: stringList(lines.work),
        happy: stringList(lines.happy),
        sad: stringList(lines.sad),
      },
      pokeLines: stringList(hero.pokeLines, 10),
      pokeMad: stringList(hero.pokeMad, 6),
      status: hero.status && typeof hero.status === 'object' ? hero.status : {},
    }
  }
  return out
}

/**
 * Автопорт: клипы, реплики и герои из TS-исходников мода.
 * Код не исполняется в общем контексте — только литералы в пустой песочнице.
 */
export function compileUpstream(files, version) {
  const bySuffix = (suffix) => files.find((file) => file.path.endsWith(suffix))
  const animation = bySuffix('/hooks/animation.ts')
  const deeds = bySuffix('/hooks/deeds.ts')
  const characters = bySuffix('/hooks/characters.ts')

  const compiled = {
    version: version || '',
    compiledAt: Date.now(),
    clips: {},
    heroClips: {},
    voices: { ru: {}, en: {} },
    heroes: {},
    errors: [],
  }

  if (animation) {
    if (animation.data.length > MAX_SOURCE) compiled.errors.push('animation.ts слишком большой')
    const source = animation.data.length > MAX_SOURCE ? '' : animation.data.toString('utf8')
    try {
      const clips = evaluate(takeLiteral(source, 'const CLIPS') || '{}')
      compiled.clips = cleanClips(clips)
    } catch (error) {
      compiled.errors.push(`clips: ${error.message}`)
    }
    try {
      const literal = takeLiteral(source, 'const HERO_CLIPS')
      if (literal) compiled.heroClips = cleanHeroClips(evaluate(literal))
    } catch (error) {
      compiled.errors.push(`heroClips: ${error.message}`)
    }
  } else {
    compiled.errors.push('animation.ts не найден')
  }

  if (deeds) {
    const source = deeds.data.toString('utf8')
    compiled.voices.ru = parseVoices(source, 'RU')
    compiled.voices.en = parseVoices(source, 'EN')
    if (!Object.keys(compiled.voices.ru).length) compiled.errors.push('реплики RU не разобраны')
  } else {
    compiled.errors.push('deeds.ts не найден')
  }

  if (characters) {
    const source = characters.data.toString('utf8')
    try {
      const literal = takeLiteral(source, 'const HEROES', '[')
      if (literal) compiled.heroes = cleanHeroes(evaluate(literal))
    } catch (error) {
      compiled.errors.push(`heroes: ${error.message}`)
    }
  } else {
    compiled.errors.push('characters.ts не найден')
  }

  return compiled
}

const text = (buffer, start, length) => {
  const slice = buffer.subarray(start, start + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8')
}

// Минимальный читатель tar: обычные файлы и pax-заголовки длинных имён.
export function readTar(buffer) {
  const out = []
  let offset = 0
  let paxPath = null
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const size = Number.parseInt(text(header, 124, 12).trim() || '0', 8) || 0
    const type = String.fromCharCode(header[156] || 48)
    const name = text(header, 0, 100)
    const prefix = text(header, 345, 155)
    const start = offset + 512
    const data = buffer.subarray(start, start + size)

    if (type === 'x') {
      for (const line of data.toString('utf8').split('\n')) {
        const match = /^\d+ path=(.*)$/.exec(line)
        if (match) paxPath = match[1]
      }
    } else if (type === '0' || type === '\0') {
      out.push({ path: paxPath || (prefix ? `${prefix}/${name}` : name), data })
      paxPath = null
    } else if (type === '5') {
      paxPath = null
    }
    offset = start + Math.ceil(size / 512) * 512
  }
  return out
}

/** Скачивает архив оригинала, обновляет кадры и собирает данные автопорта. */
export async function syncAssets({ assetsDir, signal, log = () => {} }) {
  const started = Date.now()
  const version = await remoteVersion(signal)
  log(`Оригинал: v${version}`)

  const response = await fetch(TARBALL, { signal })
  if (!response.ok) throw new Error(`Архив: GitHub ответил ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_ARCHIVE) throw new Error('Архив больше допустимого размера')
  log(`Скачано ${(bytes.length / 1048576).toFixed(1)} МБ`)

  const files = readTar(gunzipSync(bytes))
  let written = 0
  let skipped = 0
  let copied = 0

  for (const file of files) {
    const match = ASSET.exec(file.path)
    if (!match) continue
    if (match[2] && !PET_HEROES.has(match[2])) continue
    const target = path.join(assetsDir, ...match[1].split('/'))
    copied += 1
    try {
      const existing = await readFile(target)
      if (existing.length === file.data.length && existing.equals(file.data)) {
        skipped += 1
        continue
      }
    } catch { /* файла ещё нет */ }
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.data)
    written += 1
  }

  let compiled = null
  let compiledError = ''
  try {
    compiled = compileUpstream(files, version)
    if (compiled.errors.length) compiledError = compiled.errors.join('; ')
  } catch (error) {
    compiledError = String((error && error.message) || error)
  }

  return {
    version,
    written,
    skipped,
    known: copied,
    entries: files.length,
    ms: Date.now() - started,
    compiled,
    compiledError,
  }
}
