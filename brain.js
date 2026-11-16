// Персонажи, клипы и реплики edgerunners, перенесённые из мода для Claude Code.
// Кадры лежат в assets/pet/<герой>/<клип>_NN.png и отдаются штатным маршрутом ресурсов.

export const DEFAULT_HERO = 'kadr'

export const HEROES = {
  kadr: { name: 'Роман', who: 'блогер с камерой', scale: 1.0 },
  talia: { name: 'Талия', who: 'кибер-ниндзя', scale: 1.0 },
  di: { name: 'Ди', who: 'механик', scale: 1.0 },
  wick: { name: 'Уик', who: 'фиксер', scale: 1.05 },
}

export const HERO_IDS = Object.keys(HEROES)

// Имена для английского интерфейса: в оригинале имена только русские.
export const HERO_NAMES_EN = { kadr: 'Roman', talia: 'Talia', di: 'Di', wick: 'Wick' }

export function nameOf(hero, lang) {
  const id = HEROES[hero] ? hero : DEFAULT_HERO
  if (lang === 'en') return HERO_NAMES_EN[id] || HEROES[id].name
  return HEROES[id].name
}

// --- Автопорт из оригинала ------------------------------------------------

let upstream = null

/** Принимает собранные update.js клипы, реплики и героев (или null, чтобы вернуть встроенные). */
export function setUpstream(data) {
  if (!data || typeof data !== 'object') { upstream = null; return }
  upstream = data
  const heroes = data.heroes || {}
  for (const [id, hero] of Object.entries(heroes)) {
    if (HEROES[id] && hero && hero.name) HEROES[id].name = hero.name
    if (HEROES[id] && hero && hero.role) HEROES[id].who = hero.role
  }
}

export function upstreamInfo() {
  if (!upstream) return null
  const clips = Object.keys(upstream.clips || {}).length
  const heroClips = Object.values(upstream.heroClips || {})
    .reduce((sum, set) => sum + Object.keys(set || {}).length, 0)
  const lines = Object.values((upstream.voices && upstream.voices.ru) || {})
    .reduce((sum, set) => sum + Object.keys(set || {}).length, 0)
  return {
    version: upstream.version || '',
    clips,
    heroClips,
    lines,
    heroes: Object.keys(upstream.heroes || {}).length,
    compiledAt: upstream.compiledAt || 0,
    errors: upstream.errors || [],
  }
}

// Бегущая строка статуса на HUD.
export const STATUS = {
  idle: 'ONLINE', look: 'СМОТРИТ', curious: 'СМОТРИТ', surprised: '!!!', think: 'ДУМАЕТ', walk: 'ИЩЕТ',
  film: 'РАБОТАЕТ', happy: 'ГОТОВО', hello: 'ПРИВЕТ', sad: 'ОШИБКА', sit: 'ОТДЫХ', yawn: 'ОТДЫХ',
  lie: 'ОТДЫХ', sleep: 'СПИТ', wave: 'ПРИВЕТ', nod: 'ПОНЯЛ', laugh: 'ХА-ХА', celebrate: 'ЕСТЬ!',
  dance: 'ТАНЦУЕТ', type: 'ПЕЧАТАЕТ', read: 'ЧИТАЕТ', scan: 'ИЩЕТ', point: 'ЭЙ, ТЫ!', facepalm: 'ОЙ…',
  angry: 'ЗЛИТСЯ', scared: 'ОПАСНО', shrug: 'НУ ВОТ', stretch: 'РАЗМИНКА', bored: 'СКУЧАЕТ',
  drink: 'ПЕРЕРЫВ', sneeze: 'АПЧХИ', phone: 'НА СВЯЗИ', music: 'МУЗЫКА', clap: 'БРАВО', bow: 'ПОКЛОН',
  selfie: 'ПОЗИРУЕТ', fix: 'ЧИНИТ', run: 'БЕЖИТ', scratch: 'ОТДЫХ',
  sitDown: 'САДИТСЯ', standUp: 'ВСТАЁТ', lieDown: 'ЛОЖИТСЯ', getUp: 'ВСТАЁТ', fallAsleep: 'ЗАСЫПАЕТ',
  wakeUp: 'ПРОСНУЛСЯ', raiseCam: 'КАМЕРА', lowerCam: 'КАМЕРА', toChin: 'ДУМАЕТ', fromChin: 'ДУМАЕТ',
}

const STATUS_EN = {
  idle: 'ONLINE', look: 'LOOKING', curious: 'LOOKING', surprised: '!!!', think: 'THINKING', walk: 'SEARCHING',
  film: 'WORKING', happy: 'DONE', hello: 'HELLO', sad: 'ERROR', sit: 'RESTING', yawn: 'RESTING',
  lie: 'RESTING', sleep: 'SLEEPING', wave: 'HELLO', nod: 'GOT IT', laugh: 'HA-HA', celebrate: 'YES!',
  dance: 'DANCING', type: 'TYPING', read: 'READING', scan: 'SEARCHING', point: 'HEY!', facepalm: 'OOPS',
  angry: 'ANGRY', scared: 'DANGER', shrug: 'WELL', stretch: 'WARMING UP', bored: 'BORED',
  drink: 'BREAK', sneeze: 'ACHOO', phone: 'ON CALL', music: 'MUSIC', clap: 'BRAVO', bow: 'BOW',
  selfie: 'POSING', fix: 'FIXING', run: 'RUNNING', scratch: 'RESTING',
  sitDown: 'SITTING', standUp: 'STANDING', lieDown: 'LYING', getUp: 'RISING', fallAsleep: 'FALLING ASLEEP',
  wakeUp: 'AWAKE', raiseCam: 'CAMERA', lowerCam: 'CAMERA', toChin: 'THINKING', fromChin: 'THINKING',
}

export function statusOf(clip, lang) {
  const table = lang === 'en' ? STATUS_EN : STATUS
  return table[clip] || (lang === 'en' ? 'ONLINE' : 'ONLINE')
}

// Шаг: [кадр, миллисекунды, эффект шага?].
const even = (name, count, ms) =>
  Array.from({ length: count }, (_, i) => [`${name}_0${i + 1}`, ms])

// Переход по кадрам name_01..count: медленнее в начале и в конце.
const ease = (name, count, slow, fast, back = false, first) => {
  const frames = Array.from({ length: count }, (_, i) => `${name}_0${i + 1}`)
  return (back ? frames.reverse() : frames).map((frame, i) => {
    const ms = Math.round(slow - (slow - fast) * Math.sin((Math.PI * i) / (count - 1)))
    return i === 0 && first ? [frame, ms, first] : [frame, ms]
  })
}

const FILM = [260, 180, 230, 180, 220, 180, 230, 180].map((ms, i) => [`film_0${i + 1}`, ms])

// Клипы мода (без трюков напарников: они есть только у Талии).
export const CLIPS = {
  idle: {
    posture: 'stand', loop: true,
    steps: [
      ['idle_01', 4200], ['idle_02', 110], ['idle_01', 3000], ['iv_02', 1800],
      ['idle_01', 3600], ['idle_02', 110], ['idle_01', 2200], ['iv_03', 1800],
      ['idle_01', 4000], ['iv_07', 130], ['idle_01', 3000], ['iv_04', 1400],
      ['idle_01', 3800], ['idle_02', 110], ['idle_01', 2000], ['iv_08', 1800],
      ['idle_01', 3600], ['idle_02', 110], ['idle_01', 2400], ['idle_03', 1200],
    ],
  },
  scratch: { posture: 'stand', steps: [['iv_01', 240], ['iv_05', 1300], ['iv_01', 300], ['iv_06', 1200], ['iv_01', 300], ['filmyou_01', 1600], ['iv_01', 240]] },
  look: { posture: 'stand', steps: [['look_01', 900], ['idle_01', 240], ['look_02', 900], ['idle_02', 110], ['idle_01', 400]] },
  curious: { posture: 'stand', loop: true, overlay: 'question', steps: [['curious_01', 800]] },
  surprised: { posture: 'stand', hop: true, overlay: 'bang', steps: [['surprised_01', 800, 'hop']] },
  think: { posture: 'stand', loop: true, overlay: 'question', steps: [['think_01', 1040], ['think_02', 600], ['think_03', 600], ['think_04', 450], ['think_02', 400]] },
  walk: { posture: 'stand', loop: true, steps: even('walk', 8, 100) },
  film: { posture: 'stand', loop: true, steps: FILM },
  happy: { posture: 'stand', steps: [['happy_01', 180], ['happy_02', 90], ['happy_03', 90], ['happy_04', 200], ['happy_05', 90], ['happy_06', 180]] },
  hello: { posture: 'stand', loop: true, steps: [['hello_01', 1040], ['hello_02', 300], ['hello_01', 1040], ['hello_03', 500], ['hello_04', 600]] },
  sad: { posture: 'stand', loop: true, steps: [['sad_01', 2600], ['sad_02', 700], ['sad_03', 900], ['sad_04', 700]] },
  sit: { posture: 'sit', loop: true, steps: [['sit_01', 3600], ['sit_02', 120], ['sit_01', 1200]] },
  yawn: { posture: 'sit', steps: [['yawn_01', 1300], ['doze_01', 1300]] },
  lie: { posture: 'lie', loop: true, steps: [['lie_01', 3000], ['lie_02', 220], ['lie_01', 2400]] },
  sleep: { posture: 'sleep', loop: true, overlay: 'zzz', steps: [['sleep_01', 1800]] },
  wave: { posture: 'stand', steps: [['wave_01', 200], ['wave_02', 120], ['wave_03', 180], ['wave_04', 180], ['wave_03', 180], ['wave_04', 180], ['wave_02', 120], ['wave_01', 160]] },
  nod: { posture: 'stand', steps: [['nod_01', 160], ['nod_02', 110], ['nod_03', 130], ['nod_02', 100], ['nod_03', 120], ['nod_04', 320], ['nod_01', 160]] },
  laugh: { posture: 'stand', steps: [['laugh_01', 200], ['laugh_02', 110], ['laugh_03', 110], ['laugh_02', 110], ['laugh_03', 110], ['laugh_04', 420], ['laugh_01', 160]] },
  celebrate: { posture: 'stand', steps: [['celebrate_01', 220], ['celebrate_02', 120], ['celebrate_03', 300], ['celebrate_04', 800]] },
  dance: {
    posture: 'stand', loop: true,
    steps: [
      ['dance_01', 150], ['dance_02', 150], ['dance_03', 150], ['dance_04', 150],
      ['dance_05', 150], ['dance_06', 150], ['dance_07', 150], ['dance_08', 150],
    ],
  },
  type: { posture: 'stand', loop: true, steps: [['type_01', 260], ['type_02', 170], ['type_03', 170], ['type_02', 170], ['type_03', 170], ['type_04', 260]] },
  read: { posture: 'stand', loop: true, steps: [['read_01', 700], ['read_02', 500], ['read_03', 700], ['read_04', 500]] },
  scan: { posture: 'stand', loop: true, steps: [['scan_01', 800], ['scan_02', 500], ['scan_03', 800], ['scan_04', 600]] },
  point: { posture: 'stand', steps: [['point_01', 220], ['point_02', 100], ['point_03', 560], ['point_04', 240]] },
  facepalm: { posture: 'stand', steps: [['facepalm_01', 220], ['facepalm_02', 120], ['facepalm_03', 500], ['facepalm_04', 900], ['facepalm_02', 130], ['facepalm_01', 160]] },
  angry: { posture: 'stand', steps: [['angry_01', 240], ['angry_02', 180], ['angry_01', 150], ['angry_02', 180], ['angry_03', 900], ['angry_04', 520]] },
  scared: { posture: 'stand', overlay: 'bang', steps: [['scared_01', 120], ['scared_02', 90], ['scared_03', 350, 'shake'], ['scared_04', 160], ['scared_03', 400, 'shake'], ['scared_04', 500]] },
  shrug: { posture: 'stand', steps: [['shrug_01', 200], ['shrug_02', 110], ['shrug_03', 620], ['shrug_04', 260]] },
  stretch: { posture: 'stand', steps: [['stretch_01', 300], ['stretch_02', 180], ['stretch_03', 900], ['stretch_04', 320]] },
  bored: { posture: 'stand', loop: true, steps: [['bored_01', 1500], ['bored_02', 900], ['bored_03', 1100], ['bored_04', 1300]] },
  drink: { posture: 'stand', steps: [['drink_01', 240], ['drink_02', 130], ['drink_03', 800], ['drink_04', 450], ['drink_01', 180]] },
  sneeze: { posture: 'stand', steps: [['sneeze_01', 420], ['sneeze_02', 380], ['sneeze_03', 130], ['sneeze_04', 420]] },
  phone: { posture: 'stand', loop: true, steps: [['phone_01', 1000], ['phone_02', 600], ['phone_03', 1000], ['phone_04', 600]] },
  music: { posture: 'stand', loop: true, steps: [['music_01', 270], ['music_02', 270], ['music_03', 270], ['music_04', 270]] },
  clap: { posture: 'stand', steps: [['clap_01', 180], ['clap_02', 130], ['clap_03', 130], ['clap_02', 130], ['clap_03', 130], ['clap_04', 320], ['clap_01', 160]] },
  bow: { posture: 'stand', steps: [['bow_01', 240], ['bow_02', 200], ['bow_03', 600], ['bow_04', 260]] },
  selfie: { posture: 'stand', steps: [['selfie_01', 220], ['selfie_02', 440], ['selfie_03', 140], ['selfie_04', 900]] },
  fix: { posture: 'stand', steps: [['fix_01', 300], ['fix_02', 500], ['fix_03', 600], ['fix_04', 500]] },
  run: { posture: 'stand', loop: true, steps: even('run', 8, 80) },
  sitDown: { posture: 'sit', steps: ease('sd', 8, 140, 90) },
  standUp: { posture: 'stand', steps: ease('sd', 8, 120, 90, true) },
  lieDown: { posture: 'lie', steps: ease('ld', 4, 140, 100) },
  getUp: { posture: 'sit', steps: ease('ld', 4, 120, 90, true) },
  fallAsleep: { posture: 'sleep', steps: ease('fa', 4, 140, 120) },
  wakeUp: { posture: 'lie', overlay: 'bang', steps: ease('fa', 4, 120, 90, true, 'shake') },
  raiseCam: { posture: 'stand', steps: ease('rc', 4, 130, 90) },
  lowerCam: { posture: 'stand', steps: ease('rc', 4, 110, 90, true) },
  toChin: { posture: 'stand', steps: ease('tc', 4, 130, 90) },
  fromChin: { posture: 'stand', steps: ease('tc', 4, 110, 90, true) },
}

// У Романа своя съёмка: с колена и камерой над головой.
export const HERO_CLIPS = {
  kadr: {
    film: {
      posture: 'stand', loop: true,
      steps: [
        ...FILM, ...FILM,
        ['rc_03', 110], ['rc_02', 110], ['sd_03', 120],
        ['an_01', 300], ['an_02', 800], ['an_03', 800], ['an_04', 600],
        ['sd_03', 120], ['rc_02', 110], ['rc_03', 110],
        ...FILM,
        ['an_08', 130],
        ['an_05', 300], ['an_06', 800], ['an_07', 800], ['an_08', 300],
      ],
    },
  },
}

export const clipOf = (name, hero) => {
  if (upstream) {
    const own = upstream.heroClips && upstream.heroClips[hero] && upstream.heroClips[hero][name]
    if (own) return own
    const shared = upstream.clips && upstream.clips[name]
    if (shared) return shared
  }
  return (HERO_CLIPS[hero] && HERO_CLIPS[hero][name]) || CLIPS[name] || CLIPS.idle
}

export const clipLength = (name, hero) =>
  clipOf(name, hero).steps.reduce((sum, step) => sum + step[1], 0)

// --- Реплики героев -------------------------------------------------------

const R = {
  kadr: {
    idle: ['Мотор!', 'Камера на мне, ты — в кадре.', 'Это в монтаж!', 'Тихо, я записываю.'],
    read: ['Читаю. Кадр уже интересный.', 'Так, что тут у нас…', 'Строчку за строчкой, как сцену.'],
    scan: ['Ищу. Всё в кадре.', 'Прочёсываю локацию.', 'Кадр-кадр-кадр…'],
    type: ['Печатаю сцену.', 'Правки в сценарий!', 'Пишу. Камера, мотор!'],
    bash: ['Снимаю. Не мешай в кадре.', 'Дубль!', 'Сколько можно — снимаю.'],
    walk: ['Иду за материалом.', 'Сейчас найдём.', 'Так, куда это ведёт…'],
    phone: ['Связь. Слышу.', 'Вызываю группу.', 'Алло, это Роман!'],
    done: ['Снято!', 'Дубль чистый.', 'Это в монтаж!'],
    error: ['Брак в кадре…', 'Переснимем.', 'Камеру заело.'],
    poke: ['Эй! Я на съёмке!', 'Ты чего трясёшь камеру?', 'Мотор-мотор, я тут!'],
    sleep: ['Zzz… снято…', '…ещё дубль…'],
  },
  talia: {
    idle: ['Тихо. Я в сети.', 'Слежу за периметром.', 'Жду сигнала.'],
    read: ['Читаю данные.', 'Дамп идёт.', 'Смотрю трассу.'],
    scan: ['Взламываю…', 'Сканирую сектор.', 'Ищу дыру в защите.'],
    type: ['Пишу эксплойт.', 'Обхожу фаервол.', 'Код течёт.'],
    bash: ['Взламываю. Тихо.', 'Периметр пробит.', 'Ухожу в тень.'],
    walk: ['Смена позиции.', 'Иду по крышам.', 'Тихо, тихо…'],
    phone: ['На связи.', 'Докладываю.', 'Канал открыт.'],
    done: ['Чисто.', 'Ухожу в тень.', 'Готово. Вас тут не было.'],
    error: ['След. Засветилась.', 'Обрыв.', 'Меня срезали.'],
    poke: ['Руки.', 'Не трогай ниндзя.', 'Хм. Ещё раз — и тень.'],
    sleep: ['…тихо…', '…один сигнал…'],
  },
  di: {
    idle: ['Жду. Паяю в голове.', 'Работает — не трогай.', 'Нормально всё.'],
    read: ['Чиню. Смотрю схему.', 'Так, откуда это…', 'Читаю сервис-мануал.'],
    scan: ['Ищу, где коротит.', 'Прозваниваю.', 'Так-так, вот здесь.'],
    type: ['Печатаю драйвер.', 'Меняю железку на код.', 'Сейчас заведётся.'],
    bash: ['Чиню. Не мешай.', 'Перепаяем.', 'Работает — не трогай.'],
    walk: ['Иду за инструментом.', 'Где мой паяльник?', 'Смена места.' ],
    phone: ['Слышу. Чинить?', 'Принял.', 'Уже там.'],
    done: ['Работает — не трогай.', 'Перепаяем — и всё.', 'Готово. Чисто.'],
    error: ['Короткое…', 'Сдохло.', 'Это не починка, это некролог.'],
    poke: ['Не тыкай в плату.', 'Током дёрнет.', 'Аккуратно.'],
    sleep: ['…не трогай… работает…', 'Zzz…'],
  },
  wick: {
    idle: ['Работаем.', 'План такой…', 'Сидим, ждём.'],
    read: ['Читаю. Дальше — по плану.', 'Смотрю на факты.', 'Так, вводные есть.'],
    scan: ['Разведка.', 'Смотрю, кто рядом.', 'Ищу подход.'],
    type: ['Пишу задание.', 'Правки в план.', 'Печатаю.'],
    bash: ['Работаем.', 'План такой…', 'Выполняем.'],
    walk: ['Иду по адресу.', 'Двигаюсь.', 'На месте буду через минуту.'],
    phone: ['На связи.', 'Слушаю.', 'Докладывай.'],
    done: ['Чисто сработано, малой.', 'Всё по плану.', 'Работаем дальше.'],
    error: ['Плохо.', 'План ломается.', 'Не так пошли.'],
    poke: ['Ты уверен?', 'Спокойно.', 'Ещё раз — и разговор.'],
    sleep: ['…всё по плану…', '…ждём…'],
  },
}

// Герой-специфичный клип для работы с инструментом Bash/PowerShell.
const BASH_CLIP = { kadr: 'film', talia: 'film', di: 'fix', wick: 'phone' }

// Какой клип играет герой за дело этого вида.
export function clipForDeed(kind, hero) {
  if (kind === 'bash') return bashClip(hero)
  if (kind === 'read' || kind === 'scan' || kind === 'type' || kind === 'walk' || kind === 'phone') return kind
  return 'walk'
}

const EN_LINES = {
  idle: ['Standing by.', 'On the job.', 'Waiting for orders.'],
  done: ['Done.', 'Clean run.', 'That’s a wrap.'],
  error: ['That failed.', 'Broke.', 'Not good.'],
  poke: ['Hey.', 'Hands off.', 'Careful.'],
  sleep: ['…zzz…', '…dozing…'],
  hello: ['Hi.'],
}

// Пасхалки с отсылками к сериалу. Это наши реплики, автопорт из оригинала их не затирает:
// пул лежит поверх и срабатывает редко, без повтора подряд.
const FLAVOR = {
  kadr: {
    work: [
      ['Свет, камера, Найт-Сити.', 'Lights, camera, Night City.'],
      ['Снимаю новый ХБД, не лезь в кадр.', 'Rolling a new XBD, stay out of frame.'],
    ],
    error: [
      ['Плёнка сгорела, как башня Арасаки.', 'Footage burned like Arasaka Tower.'],
    ],
  },
}
const FLAVOR_CHANCE = 0.18
const FLAVOR_KIND = {
  read: 'work', scan: 'work', type: 'work', bash: 'work', walk: 'work', phone: 'work',
  error: 'error', fail: 'error',
}
const flavorLast = new Map()

function flavorLine(hero, key, lang) {
  const kind = FLAVOR_KIND[key]
  if (!kind) return ''
  const pool = FLAVOR[hero] && FLAVOR[hero][kind]
  if (!pool || !pool.length) return ''
  if (Math.random() > FLAVOR_CHANCE) return ''
  const marker = `${hero}:${kind}`
  const last = flavorLast.get(marker)
  let index = Math.floor(Math.random() * pool.length)
  if (pool.length > 1 && index === last) index = (index + 1) % pool.length
  flavorLast.set(marker, index)
  const pair = pool[index]
  return lang === 'en' ? pair[1] : pair[0]
}

export function pickLine(hero, key, target = '', lang = 'ru') {
  const flavor = flavorLine(hero, key, lang)
  if (flavor) return flavor
  const line = upstreamLine(hero, key, target, lang)
  if (line) return line
  // Встроенные наборы хранят неудачу как `error`, а вызывающий код передаёт `fail`.
  const fallback = key === 'fail' ? 'error' : key
  if (lang === 'en') {
    const set = EN_LINES[fallback] || EN_LINES.idle
    return set[Math.floor(Math.random() * set.length)] || set[0]
  }
  const set = (R[hero] || R.kadr)[fallback] || R.kadr[fallback] || R.kadr.idle
  return set[Math.floor(Math.random() * set.length)] || set[0]
}

const KIND_ALIAS = {
  read: 'read', scan: 'search', type: 'edit', bash: 'run', walk: 'web', phone: 'agent',
  done: 'happy', error: 'fail', sleep: 'idle', idle: 'idle',
}

const randomOf = (list) => list[Math.floor(Math.random() * list.length)] || ''

function upstreamLine(hero, key, target, lang) {
  if (!upstream) return ''
  const who = (upstream.heroes && upstream.heroes[hero]) || null
  if (lang !== 'en') {
    const mood = { idle: 'idle', sleep: 'idle', done: 'happy', error: 'sad', think: 'think' }[key]
    if (key === 'poke' && who && who.pokeLines && who.pokeLines.length) return randomOf(who.pokeLines)
    if (mood && who && who.lines && who.lines[mood] && who.lines[mood].length) return randomOf(who.lines[mood])
  }
  const voices = (upstream.voices && (upstream.voices[lang] || upstream.voices.ru)) || {}
  const kind = KIND_ALIAS[key] || key
  const set = (voices[hero] && voices[hero][kind]) || (voices.plain && voices.plain[kind])
  if (!set || !set.length) return ''
  return randomOf(set).replaceAll('{t}', target ? clip(target, 40) : '…')
}

export function bashClip(hero) {
  return BASH_CLIP[hero] || 'film'
}

// --- Что делает агент -----------------------------------------------------

const READ = new Set(['read', 'read_image', 'office_convert', 'office_render', 'office_recalculate'])
const SCAN = new Set(['glob', 'grep', 'session_search', 'session_event_search', 'list_agents', 'job_list', 'terminal_list', 'schedule_list', 'plugin_market', 'cordis_inspect_list'])
const EDIT = new Set(['edit', 'write', 'apply_patch', 'todo_write'])
const SHELL = new Set(['bash', 'pwsh'])
const WEB = new Set(['web_search', 'web_fetch'])
const TALK = new Set(['subagent', 'workflow', 'workflow_run', 'send_message', 'wait_agent', 'task', 'list_agents'])

const base = (value) => String(value ?? '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || ''

const commandHead = (command) => command.split(/\s+/).filter(Boolean).slice(0, 2).join(' ')

// Уточняет вид дела по команде — как это делает мод: тесты, сборка, git, установка.
const bashDeed = (command) => {
  if (!command) return 'run'
  if (/git\s+(add|commit)\b/i.test(command)) return 'commit'
  if (/git\s+push\b/i.test(command)) return 'push'
  if (/\b(tests?|vitest|jest|pytest|mocha|playwright)\b/i.test(command)) return 'test'
  if (/\b(build|tsc|webpack|rollup|esbuild|msbuild|make|vite)\b/i.test(command)) return 'build'
  if (/^\s*(npm|pnpm|yarn|bun|pip|pip3|cargo|uv|poetry)\s+(install|i|add|ci)\b/i.test(command)) return 'install'
  if (/git\s+(status|diff|log|show|blame|branch|remote)\b/i.test(command)) return 'look'
  return 'run'
}

export function deedOf(tool, input, lang = 'ru') {
  const en = lang === 'en'
  const name = String(tool || '')
  const args = input && typeof input === 'object' ? input : {}
  if (SHELL.has(name)) {
    const command = String(args.command || args.script || '').trim()
    const target = commandHead(command)
    return {
      clipKind: 'bash',
      deedKind: bashDeed(command),
      target,
      text: target ? `${en ? 'command' : 'команда'}: ${clip(target, 40)}` : (en ? 'command' : 'команда'),
    }
  }
  if (EDIT.has(name)) {
    const file = base(args.file_path || args.path || args.file)
    return {
      clipKind: 'type',
      deedKind: name === 'write' ? 'write' : 'edit',
      target: file,
      text: file ? `${en ? 'editing' : 'правит'} ${clip(file, 40)}` : (en ? 'editing code' : 'правит код'),
    }
  }
  if (READ.has(name)) {
    const file = base(args.file_path || args.path || args.file)
    return {
      clipKind: 'read',
      deedKind: 'read',
      target: file,
      text: file ? `${en ? 'reading' : 'читает'} ${clip(file, 40)}` : (en ? 'reading' : 'читает'),
    }
  }
  if (SCAN.has(name)) {
    const pattern = String(args.pattern || args.query || '').trim()
    return {
      clipKind: 'scan',
      deedKind: 'search',
      target: pattern,
      text: pattern ? `${en ? 'searching' : 'ищет'} ${clip(pattern, 40)}` : (en ? 'searching' : 'ищет'),
    }
  }
  if (WEB.has(name)) {
    const q = String(args.query || args.url || '').trim()
    return {
      clipKind: 'walk',
      deedKind: 'web',
      target: q,
      text: q ? `${en ? 'web' : 'наружу'}: ${clip(q, 36)}` : (en ? 'web' : 'в сеть'),
    }
  }
  if (TALK.has(name)) {
    return {
      clipKind: 'phone',
      deedKind: 'agent',
      target: name,
      text: `${en ? 'calls' : 'зовёт'}: ${clip(name, 32)}`,
    }
  }
  return { clipKind: 'walk', deedKind: 'other', target: name, text: clip(name || (en ? 'task' : 'дело'), 40) }
}

export function clip(text, max) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
