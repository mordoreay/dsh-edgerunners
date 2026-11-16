// Хост-половина edgerunners: читает события DSH, ведёт сцену героя, хранит настройки
// и отдаёт всё браузеру. Кадры раздаёт штатный маршрут пакетных ресурсов.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_HERO, HEROES, HERO_IDS, STATUS,
  clipLength, clipOf, clipForDeed, deedOf, nameOf, pickLine, statusOf,
  setUpstream, upstreamInfo,
} from './brain.js'
import { isNewer, remoteVersion, syncAssets } from './update.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = path.join(ROOT, 'assets')
const DATA_DIR = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CONFIG_PATH = path.join(DATA_DIR, 'edgerunners.json')
const COMPILED_PATH = path.join(DATA_DIR, 'edgerunners-upstream.json')
const CODE_RESULT_PATH = path.join(DATA_DIR, 'edgerunners-code.json')
const MARKET_URL = 'https://raw.githubusercontent.com/mordoreay/dsh-edgerunners/main/marketplace.json'

const clampScale = (value) => Math.min(400, Math.max(70, Math.round(Number(value) || 100)))
const LANGS = ['ru', 'en']
const clampLang = (value) => (LANGS.includes(value) ? value : 'ru')
const freshConfig = () => ({ hero: DEFAULT_HERO, scale: 100, lang: 'ru', upstream: { version: '', checkedAt: 0 } })

export const inject = ['webServer']

export function apply(ctx) {
  const timers = new Set()

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id)
      try { fn() } catch { /* сцена не должна ломать ход */ }
    }, ms)
    timers.add(id)
    return id
  }
  const clearLater = () => {
    for (const id of timers) clearTimeout(id)
    timers.clear()
  }

  // --- Сцена -------------------------------------------------------------

  const scene = {
    seq: 0,
    hero: DEFAULT_HERO,
    clip: 'idle',
    at: Date.now(),
    steps: clipOf('idle', DEFAULT_HERO).steps,
    loop: true,
    overlay: null,
    status: STATUS.idle,
    line: '',
    deed: '',
    busy: false,
    lastActivity: Date.now(),
    lastWorkAt: 0,
    lineSeq: 0,
  }

  const snapshot = () => ({
    seq: scene.seq,
    lineSeq: scene.lineSeq,
    hero: scene.hero,
    name: nameOf(scene.hero, config.lang),
    lang: config.lang,
    clip: scene.clip,
    at: scene.at,
    steps: scene.steps,
    loop: scene.loop,
    overlay: scene.overlay,
    status: statusOf(scene.clip, config.lang),
    line: scene.line,
    deed: scene.deed,
    busy: scene.busy,
    scale: config.scale,
    upstream: { version: config.upstream.version, checkedAt: config.upstream.checkedAt },
  })

  let revert

  function play(clip, options = {}) {
    const hero = options.hero || scene.hero
    const data = clipOf(clip, hero)
    scene.clip = clip
    scene.at = Date.now()
    scene.steps = data.steps
    scene.loop = options.loop === undefined ? Boolean(data.loop) : options.loop
    scene.overlay = data.overlay || null
    scene.status = STATUS[clip] || ''
    if (options.line) { scene.line = options.line; scene.lineSeq += 1 }
    if (options.deed !== undefined) scene.deed = options.deed
    scene.seq += 1
    scene.lastActivity = Date.now()

    clearTimeout(revert)
    if (!scene.loop) {
      const length = clipLength(clip, hero)
      revert = later(() => {
        if (scene.clip === clip) rest()
      }, length + 120)
    }
  }

  // Отдых: герой сам садится, ложится и засыпает, если дел нет.
  const SIT_AFTER = 90_000
  const LIE_AFTER = 160_000
  const SLEEP_AFTER = 260_000

  function rest() {
    scene.deed = ''
    scene.busy = false
    const quiet = Date.now() - scene.lastActivity
    if (quiet > SLEEP_AFTER) play('sleep', { loop: true })
    else if (quiet > LIE_AFTER) play('lie', { loop: true })
    else if (quiet > SIT_AFTER) play('sit', { loop: true })
    else play('idle', { loop: true })
    scheduleRest()
  }

  let restTimer
  function scheduleRest() {
    clearTimeout(restTimer)
    restTimer = later(() => {
      const quiet = Date.now() - scene.lastActivity
      if (scene.busy) return
      const restful = scene.clip === 'idle' || scene.clip === 'sit' || scene.clip === 'lie' || scene.clip === 'sleep'
      if (!restful) return
      if (quiet < SIT_AFTER) { scheduleRest(); return }
      if (scene.clip === 'idle') play('sitDown', { loop: false })
      else if (scene.clip === 'sit' && quiet > LIE_AFTER) play('lieDown', { loop: false })
      else if (scene.clip === 'lie' && quiet > SLEEP_AFTER) play('fallAsleep', { loop: false })
      scheduleRest()
    }, 12_000)
  }

  // --- Настройки и обновления -------------------------------------------

  const config = freshConfig()
  const update = { running: false, message: '', error: '', at: 0 }

  const publicConfig = () => ({
    hero: config.hero,
    heroName: (HEROES[config.hero] || HEROES[DEFAULT_HERO]).name,
    scale: config.scale,
    upstream: { ...config.upstream },
    compiled: upstreamInfo(),
    lang: config.lang,
    update: { running: update.running, message: update.message, error: update.error, at: update.at },
  })

  const lx = (ru, en) => (config.lang === 'en' ? en : ru)

  async function saveConfig() {
    try {
      await mkdir(path.dirname(CONFIG_PATH), { recursive: true })
      await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
    } catch { /* настройки не должны ломать сцену */ }
  }

  async function saveCompiled(compiled) {
    setUpstream(compiled)
    try {
      await mkdir(path.dirname(COMPILED_PATH), { recursive: true })
      await writeFile(COMPILED_PATH, JSON.stringify(compiled), 'utf8')
    } catch { /* автопорт останется в памяти до перезапуска */ }
  }

  const compiledReady = (async () => {
    try {
      setUpstream(JSON.parse(await readFile(COMPILED_PATH, 'utf8')))
    } catch { /* автопорта ещё нет — играем встроенные данные */ }
  })()

  const configReady = (async () => {
    try {
      const data = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
      if (HERO_IDS.includes(data.hero)) config.hero = data.hero
      config.scale = clampScale(data.scale)
      config.lang = clampLang(data.lang)
      if (data.upstream && typeof data.upstream === 'object') {
        config.upstream.version = String(data.upstream.version || '')
        config.upstream.checkedAt = Number(data.upstream.checkedAt) || 0
      }
    } catch { /* настроек ещё нет */ }
    if (config.hero !== scene.hero) scene.hero = config.hero
  })()

  async function runUpdate() {
    if (update.running) return { ok: false, busy: true, message: lx('Проверка уже идёт', 'A check is already running') }
    update.running = true
    update.error = ''
    update.at = Date.now()
    update.message = lx('Проверяю оригинал…', 'Checking the original…')
    const controller = new AbortController()
    const stop = later(() => controller.abort(), 120_000)
    try {
      const remote = await remoteVersion(controller.signal)
      const local = config.upstream.version
      config.upstream.checkedAt = Date.now()
      const info0 = upstreamInfo()
      // Автопорт может отсутствовать даже при той же версии: тогда данные надо собрать.
      const stale = !info0 || info0.version !== remote
      if (local && !isNewer(remote, local) && !stale) {
        await saveConfig()
        update.message = lx(`Обновлений нет: оригинал v${remote}`, `Already up to date: original v${remote}`)
        return { ok: true, updated: false, version: remote, local, message: update.message }
      }
      update.message = lx(`Качаю v${remote}…`, `Downloading v${remote}…`)
      const report = await syncAssets({
        assetsDir: ASSETS_DIR,
        signal: controller.signal,
        log: (line) => { update.message = line },
      })
      if (report.compiled) await saveCompiled(report.compiled)
      config.upstream.version = report.version || remote
      config.upstream.checkedAt = Date.now()
      await saveConfig()
      const info = upstreamInfo()
      const parts = []
      if (report.written) parts.push(lx(`${report.written} файлов`, `${report.written} files`))
      if (info && info.clips) parts.push(lx(`${info.clips} клипов`, `${info.clips} clips`))
      if (info && info.lines) parts.push(lx(`${info.lines} наборов реплик`, `${info.lines} line sets`))
      update.message = parts.length
        ? lx(`Обновлено до v${report.version}: ${parts.join(', ')}`, `Updated to v${report.version}: ${parts.join(', ')}`)
        : lx(`Уже актуально: v${report.version}`, `Already up to date: v${report.version}`)
      if (report.compiledError) update.message += lx(` (автопорт: ${report.compiledError})`, ` (autoport: ${report.compiledError})`)
      const { compiled, ...rest } = report
      return {
        ok: true,
        updated: Boolean(report.written || compiled),
        ...rest,
        message: update.message,
      }
    } catch (error) {
      update.error = String((error && error.message) || error)
      update.message = lx(`Ошибка: ${update.error}`, `Error: ${update.error}`)
      return { ok: false, error: update.error, message: update.message }
    } finally {
      clearTimeout(stop)
      update.running = false
    }
  }

  // --- Обновление кода плагина -------------------------------------------

  const code = {
    installed: '',
    latest: '',
    pending: null,
    updateKind: null,
    supported: false,
    checkedAt: 0,
    running: false,
    message: '',
    error: '',
    result: null,
  }

  const readSelfVersion = async () => {
    try {
      const manifest = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
      return String(manifest.version || '')
    } catch { return '' }
  }

  const codeStatus = () => ({
    installed: code.installed,
    latest: code.latest,
    supported: code.supported,
    updateKind: code.updateKind,
    checkedAt: code.checkedAt,
    running: code.running,
    message: code.message,
    error: code.error,
    pending: code.pending ? { version: code.pending.version, commit: code.pending.commit, spec: code.pending.spec } : null,
    result: code.result,
  })

  const codeReady = (async () => {
    code.installed = await readSelfVersion()
    try {
      const data = JSON.parse(await readFile(CODE_RESULT_PATH, 'utf8'))
      if (data && data.to && data.to === code.installed) code.result = data
    } catch { /* результата ещё нет */ }
  })()

  async function checkCode() {
    code.error = ''
    code.message = ''
    code.installed = await readSelfVersion()
    const manager = ctx.get('pluginManager')
    if (!manager) {
      code.error = lx('Менеджер плагинов недоступен в этом профиле', 'The plugin manager is unavailable in this profile')
      return codeStatus()
    }
    try {
      const response = await fetch(MARKET_URL, {
        signal: AbortSignal.timeout(15_000),
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`GitHub ответил ${response.status}`)
      const index = await response.json()
      const entry = (index.plugins || []).find((item) => item && item.name === 'dsh-edgerunners')
      const versions = ((entry && entry.versions) || []).filter((item) => (
        item && typeof item.version === 'string' && item.source && item.source.type === 'git'
        && String(item.source.url).startsWith('https://github.com/mordoreay/dsh-edgerunners')
      ))
      const newer = versions.filter((item) => isNewer(item.version, code.installed))
      newer.sort((left, right) => (isNewer(left.version, right.version) ? -1 : 1))
      const best = newer[0]
      code.latest = best ? best.version : code.installed
      let self = null
      try {
        const bundles = await manager.listBundles()
        self = Array.isArray(bundles) ? bundles.find((bundle) => bundle.name === 'dsh-edgerunners') : null
      } catch { /* менеджер мог не отдать список — считаем, что обновление не поддержано */ }
      code.updateKind = self ? (self.update || null) : null
      code.supported = Boolean(best && code.updateKind === 'git')
      code.pending = best ? {
        version: best.version,
        commit: String(best.source.commit || ''),
        spec: `git+${String(best.source.url).replace(/\.git$/, '')}.git#${best.source.commit}`,
      } : null
      code.checkedAt = Date.now()
      if (!best) {
        code.message = lx('Установлена последняя версия', 'The latest version is installed')
      } else if (code.updateKind !== 'git') {
        code.message = lx(
          'Плагин установлен из ветки — обновление кода недоступно. Переустанови его из индекса или по адресу с зафиксированным коммитом.',
          'The plugin is installed from a branch, so self-update is unavailable. Reinstall it from the index or a pinned commit spec.',
        )
      } else {
        code.message = lx(`Доступна версия ${best.version}`, `Version ${best.version} is available`)
      }
    } catch (error) {
      code.error = String((error && error.message) || error)
      code.message = lx(`Не удалось проверить обновления: ${code.error}`, `Update check failed: ${code.error}`)
    }
    return codeStatus()
  }

  async function updateCode() {
    if (code.running) return { ok: false, busy: true, ...codeStatus() }
    const manager = ctx.get('pluginManager')
    if (!manager) {
      code.error = lx('Менеджер плагинов недоступен', 'The plugin manager is unavailable')
      return { ok: false, ...codeStatus() }
    }
    await checkCode()
    if (!code.supported || !code.pending) return { ok: false, ...codeStatus() }
    const target = { ...code.pending }
    const from = code.installed
    code.running = true
    code.message = lx(`Ставлю v${target.version}…`, `Installing v${target.version}…`)
    // Отвечаем сразу: updateBundle выгружает текущую копию плагина, и её код перестаёт работать.
    globalThis.setTimeout(() => {
      Promise.resolve()
        .then(() => manager.updateBundle('dsh-edgerunners', target.version, { spec: target.spec }))
        .then(async (result) => {
          const outcome = result && result.result ? result.result : {}
          const record = {
            at: Date.now(),
            from,
            to: target.version,
            step: result ? result.step : '',
            application: outcome.application || '',
            restartReason: outcome.restartReason || '',
          }
          try {
            await mkdir(path.dirname(CODE_RESULT_PATH), { recursive: true })
            await writeFile(CODE_RESULT_PATH, JSON.stringify(record), 'utf8')
          } catch { /* отчёт не критичен */ }
        })
        .catch(async (error) => {
          const record = { at: Date.now(), from, to: target.version, error: String((error && error.message) || error) }
          try {
            await mkdir(path.dirname(CODE_RESULT_PATH), { recursive: true })
            await writeFile(CODE_RESULT_PATH, JSON.stringify(record), 'utf8')
          } catch { /* молча */ }
        })
    }, 400)
    return { ok: true, started: true, version: target.version, ...codeStatus() }
  }

  // --- События DSH -------------------------------------------------------

  function notice(tool, input) {
    const deed = deedOf(tool, input, config.lang)
    const now = Date.now()
    const clip = clipForDeed(deed.clipKind, scene.hero)
    scene.busy = true
    scene.deed = deed.text
    scene.lastActivity = now

    // Частые инструменты не должны дёргать сцену: держим рабочий клип не меньше WORK_HOLD.
    const same = scene.clip === clip
    if (same && now - scene.lastWorkAt < 6_000) {
      scene.line = pickLine(scene.hero, deed.deedKind, deed.target, config.lang)
      scene.lineSeq += 1
      return
    }
    scene.lastWorkAt = now
    play(clip, { loop: true, line: pickLine(scene.hero, deed.deedKind, deed.target, config.lang) })
  }

  function fail() {
    const now = Date.now()
    scene.lastActivity = now
    const clip = Math.random() < 0.5 ? 'facepalm' : 'sad'
    play(clip, { loop: false, line: pickLine(scene.hero, 'fail', scene.deed, config.lang) })
  }

  function done() {
    scene.busy = false
    scene.deed = ''
    scene.lastActivity = Date.now()
    const clip = Math.random() < 0.6 ? 'celebrate' : 'nod'
    play(clip, { loop: false, line: pickLine(scene.hero, 'done', '', config.lang) })
  }

  function greet() {
    scene.busy = false
    scene.deed = ''
    scene.lastActivity = Date.now()
    const who = nameOf(scene.hero, config.lang)
    const line = config.lang === 'en' ? `I'm ${who}.` : `Это я, ${who}.`
    play('bow', { loop: false, line })
    later(() => {
      if (scene.clip === 'bow') play('hello', { loop: false, line: '' })
    }, 1100)
  }

  const POKES = ['laugh', 'wave', 'surprised', 'shrug', 'celebrate']
  let pokeIndex = 0
  function poke() {
    const clip = POKES[pokeIndex % POKES.length]
    pokeIndex += 1
    scene.lastActivity = Date.now()
    play(clip, { loop: false, line: pickLine(scene.hero, 'poke', '', config.lang) })
  }

  function setHero(id) {
    const hero = HERO_IDS.includes(id) ? id : DEFAULT_HERO
    config.hero = hero
    if (hero === scene.hero) { saveConfig(); return }
    scene.hero = hero
    saveConfig()
    greet()
  }

  ctx.on('tools/pre-execute', function preExecute(exec, next) {
    try {
      const tool = exec && exec.name
      const input = exec && exec.arguments
      if (tool) notice(tool, input)
    } catch { /* наблюдатель не должен мешать инструменту */ }
    return next()
  })

  ctx.on('tools/result', function toolResult(exec, result) {
    try {
      if (result && result.isError) fail()
    } catch { /* молча */ }
  })

  ctx.on('agent/error', function agentError() {
    try { fail() } catch { /* молча */ }
  })

  ctx.on('agent/turn-stopping', function turnStopping() {
    try { done() } catch { /* молча */ }
  })

  ctx.on('agent/status', function agentStatus(payload) {
    try {
      const status = payload && payload.status
      if (status === 'running') {
        scene.busy = true
        scene.lastActivity = Date.now()
      } else if (status === 'idle') {
        scene.busy = false
        scene.lastActivity = Date.now()
        if (scene.clip === 'idle' || scene.clip === 'sit') rest()
      }
    } catch { /* молча */ }
  })

  // --- HTTP-мост ---------------------------------------------------------

  const json = (value, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })

  // Защита от запросов из чужих страниц: браузер всегда присылает sec-fetch-site,
  // поэтому cross-site вызовы (CSRF) отбиваются, а локальные клиенты без заголовка — проходят.
  const header = (request, name) => {
    if (!request || !request.headers) return undefined
    if (typeof request.headers.get === 'function') return request.headers.get(name)
    return request.headers[name.toLowerCase()]
  }

  const sameOrigin = (request) => {
    const site = header(request, 'sec-fetch-site')
    return !site || site === 'same-origin' || site === 'none'
  }

  async function stateRoute(request) {
    if (!sameOrigin(request)) return new Response('forbidden', { status: 403 })
    return json(snapshot())
  }

  // GET-only: ресурсные маршруты DSH не принимают POST, поэтому действие идёт через query.
  async function pokeRoute(request) {
    if (!sameOrigin(request)) return new Response('forbidden', { status: 403 })
    poke()
    return json({ ok: true })
  }

  async function heroRoute(request) {
    if (!sameOrigin(request)) return new Response('forbidden', { status: 403 })
    const url = new URL(request.url)
    const wanted = url.searchParams.get('hero')
    if (wanted) setHero(wanted)
    return json({ ok: true, hero: scene.hero, name: nameOf(scene.hero, config.lang) })
  }

  async function configRoute(request) {
    if (!sameOrigin(request)) return new Response('forbidden', { status: 403 })
    await configReady
    return json(publicConfig())
  }

  // Обработчики (handler) принимают POST: ресурсные маршруты — только GET.
  const readBody = (request, limit = 65536) => new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) { reject(new Error('Слишком большой запрос')); request.destroy(); return }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (!text) { resolve({}); return }
      try { resolve(JSON.parse(text)) } catch { reject(new Error('Некорректный JSON')) }
    })
    request.on('error', reject)
  })

  const handler = (fn) => async (request, response) => {
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    const send = (status, value) => {
      response.writeHead(status, headers)
      response.end(JSON.stringify(value))
    }
    if (!sameOrigin(request)) return send(403, { ok: false, error: 'forbidden' })
    if (request.method !== 'POST') return send(405, { ok: false, error: 'method not allowed' })
    const type = String(header(request, 'content-type') || '')
    // Только JSON: такой запрос из чужой страницы требует preflight, который мы не разрешаем.
    if (!type.includes('application/json')) return send(415, { ok: false, error: 'application/json required' })
    try {
      const body = await readBody(request)
      const value = await fn(body, request)
      send(200, value)
    } catch (error) {
      send(400, { ok: false, error: String((error && error.message) || error) })
    }
  }

  const saveSettings = handler(async (body) => {
    await configReady
    if (body && typeof body.hero === 'string') setHero(body.hero)
    if (body && body.scale !== undefined) {
      config.scale = clampScale(body.scale)
      await saveConfig()
    }
    if (body && body.lang !== undefined) {
      const next = clampLang(String(body.lang))
      if (next !== config.lang) {
        config.lang = next
        await saveConfig()
        greet()
      }
    }
    return { ok: true, ...publicConfig() }
  })

  let lastUpdateAt = 0

  const runUpdateHandler = handler(async () => {
    await configReady
    if (Date.now() - lastUpdateAt < 10_000) {
      return { ok: false, busy: true, message: lx('Слишком часто — подожди пару секунд', 'Too often — wait a few seconds') }
    }
    lastUpdateAt = Date.now()
    return runUpdate()
  })

  const codeRoute = async (request) => {
    if (!sameOrigin(request)) return new Response('forbidden', { status: 403 })
    await codeReady
    return json(codeStatus())
  }

  const checkCodeHandler = handler(async () => {
    await configReady
    return checkCode()
  })

  const updateCodeHandler = handler(async () => {
    await configReady
    return updateCode()
  })

  const server = ctx.webServer
  ctx.effect(() => server.register({ kind: 'exact', path: '/edgerunners/state', resource: stateRoute }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/edgerunners/poke', resource: pokeRoute }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/edgerunners/hero', resource: heroRoute }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/edgerunners/config', resource: configRoute }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/edgerunners/code', resource: codeRoute }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/edgerunners/settings', handler: saveSettings }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/edgerunners/update', handler: runUpdateHandler }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/edgerunners/code/check', handler: checkCodeHandler }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/edgerunners/code/update', handler: updateCodeHandler }))

  // --- Команда /persona --------------------------------------------------

  let commands
  try { commands = ctx.get('commands') } catch { commands = undefined }
  if (commands && typeof commands.register === 'function') {
    ctx.effect(() => commands.register({
      name: 'persona',
      description: 'Выбрать героя edgerunners: /persona kadr|talia|di|wick',
      handler: (invocation) => {
        const word = String((invocation && invocation.rawInput) || '').trim().toLowerCase()
        const map = {
          роман: 'kadr', roman: 'kadr', кадр: 'kadr',
          талия: 'talia', talia: 'talia',
          ди: 'di', di: 'di',
          уик: 'wick', wick: 'wick',
        }
        const hero = map[word]
        if (!hero) {
          return {
            kind: 'error',
            text: lx(
              `Герои: ${HERO_IDS.map(id => `${id} (${HEROES[id].name})`).join(', ')}`,
              `Heroes: ${HERO_IDS.map(id => `${id} (${nameOf(id, 'en')})`).join(', ')}`,
            ),
          }
        }
        setHero(hero)
        return { kind: 'success', text: lx(`Герой: ${HEROES[hero].name}`, `Hero: ${nameOf(hero, 'en')}`) }
      },
    }))
  }

  ctx.effect(() => () => {
    clearLater()
    clearTimeout(restTimer)
  })

  // Приветствие — только после настроек и автопорта: иначе герой здоровается
  // именем того, кто стоял по умолчанию, а потом молча меняется.
  Promise.allSettled([configReady, compiledReady]).then(() => {
    if (scene.hero !== config.hero) scene.hero = config.hero
    greet()
    scheduleRest()
  })
}
