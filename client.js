// Клиентская половина edgerunners: питомец в углу окна (shell.overlay) и строка HUD
// под ним. Состояние читается с хоста по /edgerunners/state, кадры — из пакетных ресурсов плагина.

window.__ModuleLoader__.load({
  id: 'dsh-edgerunners',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const STATE_URL = '/edgerunners/state'
    const HEROES = { kadr: 'Роман', talia: 'Талия', di: 'Ди', wick: 'Уик' }
    const LANG_NAMES = { kadr: 'Roman', talia: 'Talia', di: 'Di', wick: 'Wick' }
    const HERO_IDS = Object.keys(HEROES)

    // Панель настроек открывается и с HUD, и с питомца — состояние одно на страницу.
    const panel = { open: false, listeners: new Set() }
    const setPanel = (open) => {
      panel.open = open
      for (const listener of panel.listeners) listener()
    }
    function usePanel() {
      const [open, setOpen] = useState(panel.open)
      useEffect(() => {
        const listener = () => setOpen(panel.open)
        panel.listeners.add(listener)
        return () => panel.listeners.delete(listener)
      }, [])
      return open
    }

    // Кадры раздаёт штатный маршрут пакетных ресурсов клиентских плагинов.
    // ?v= — версия оригинала, чтобы после обновления браузер не взял старый кадр из кеша.
    // Рядом с PNG лежит @2x.webp (tools/make2x.py): браузер берёт его через srcset
    // только на экранах высокой плотности, PNG остаётся обычным и запасным.
    const framePath = (hero, frame, extension, version) => {
      const base = `/plugins/dsh-edgerunners/assets/pet/${encodeURIComponent(hero)}/${encodeURIComponent(frame)}${extension}`
      return version ? `${base}?v=${encodeURIComponent(version)}` : base
    }
    const frameSrc = (hero, frame, version) => framePath(hero, frame, '.png', version)
    const frameSrc2x = (hero, frame, version) => framePath(hero, frame, '@2x.webp', version)

    // --- Магазин состояния: один опрос на всю страницу --------------------

    const listeners = new Set()
    let current = null
    let timer = null
    let inflight = false
    let synced = false

    // Выбор героя переживает перезагрузку страницы и перезапуск хоста.
    const HERO_KEY = 'dsh-edgerunners.hero'
    const readHero = () => {
      try { return window.localStorage.getItem(HERO_KEY) || '' } catch { return '' }
    }
    const saveHero = (hero) => {
      try { window.localStorage.setItem(HERO_KEY, hero) } catch { /* приватный режим */ }
    }

    async function syncHero(scene) {
      if (synced || !scene || !scene.hero) return
      synced = true
      const wanted = readHero()
      if (!wanted || wanted === scene.hero) return
      try {
        await fetch(`/edgerunners/hero?hero=${encodeURIComponent(wanted)}`, { cache: 'no-store' })
      } catch { /* хост недоступен — не страшно */ }
    }

    async function poll() {
      if (inflight) return
      inflight = true
      try {
        const response = await fetch(STATE_URL, { cache: 'no-store' })
        if (response.ok) {
          const next = await response.json()
          current = next
          syncHero(next)
          for (const listener of listeners) listener(next)
        }
      } catch {
        // Хост может перезапускаться: держим последнюю сцену.
      } finally {
        inflight = false
      }
    }

    function subscribe(listener) {
      listeners.add(listener)
      if (!timer) {
        timer = setInterval(poll, 300)
        poll()
      }
      if (current) listener(current)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer) {
          clearInterval(timer)
          timer = null
        }
      }
    }

    function useScene() {
      const [scene, setScene] = useState(current)
      useEffect(() => subscribe(setScene), [])
      return scene
    }

    // --- Кадр клипа по времени сцены -------------------------------------

    function frameAt(scene, now) {
      const steps = scene && Array.isArray(scene.steps) ? scene.steps : []
      if (!steps.length) return { frame: null, fx: null, index: 0 }
      const total = steps.reduce((sum, step) => sum + step[1], 0) || 1
      let t = Math.max(0, now - (scene.at || now))
      if (scene.loop) t %= total
      else t = Math.min(t, total - 1)
      let index = 0
      let acc = 0
      for (let i = 0; i < steps.length; i += 1) {
        const ms = steps[i][1] || 1
        if (t < acc + ms) { index = i; break }
        acc += ms
        index = i
      }
      const step = steps[index] || steps[0]
      return { frame: step[0], fx: step[2] || null, index }
    }

    function useTick(active) {
      const [now, setNow] = useState(() => Date.now())
      useEffect(() => {
        if (!active) return undefined
        let alive = true
        const tick = () => { if (alive) setNow(Date.now()) }
        const id = setInterval(tick, 60)
        return () => { alive = false; clearInterval(id) }
      }, [active])
      return now
    }

    // --- Питомец ----------------------------------------------------------

    const PET_CSS = `
.dsh-edgerunners-pet{position:fixed;bottom:6px;z-index:60;display:flex;flex-direction:column;
  align-items:center;gap:6px;pointer-events:none;user-select:none;-webkit-user-select:none;
  font-family:"Bahnschrift","Segoe UI",system-ui,sans-serif}
.dsh-edgerunners-sprite{pointer-events:auto;cursor:pointer;background:none;border:0;padding:0;
  display:block;line-height:0;filter:drop-shadow(0 6px 10px rgba(0,0,0,.45));transform-origin:50% 100%}
.dsh-edgerunners-sprite img{display:block;image-rendering:auto}
.dsh-edgerunners-sprite:hover{transform:translateY(-1px)}
.dsh-edgerunners-preload{position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none}
.dsh-edgerunners-bubble{pointer-events:none;max-width:230px;padding:7px 10px 8px;border:1px solid #fcee0a;
  background:linear-gradient(160deg,rgba(12,14,18,.96),rgba(8,16,20,.96));color:#f2f7f8;
  font-size:12px;line-height:1.3;letter-spacing:.2px;border-radius:3px;
  box-shadow:0 0 0 1px rgba(0,0,0,.6),0 6px 18px rgba(0,0,0,.5);position:relative}
.dsh-edgerunners-bubble:before{content:"";position:absolute;left:-5px;top:8px;width:8px;height:8px;
  background:#fcee0a;transform:rotate(45deg)}
.dsh-edgerunners-bubble b{color:#fcee0a;font-weight:600}
.dsh-edgerunners-tag{font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:#2ef2ff;opacity:.85}
.dsh-edgerunners-gear{pointer-events:auto;cursor:pointer;border:0;background:none;color:#8b98a5;
  font-size:14px;line-height:1;padding:2px 4px;border-radius:4px}
.dsh-edgerunners-gear:hover{color:#fcee0a;background:rgba(252,238,10,.08)}
.dsh-edgerunners-panel{pointer-events:auto;position:fixed;right:18px;bottom:230px;width:340px;max-height:72vh;
  overflow:auto;z-index:61;padding:14px 14px 16px;border-radius:10px;
  background:var(--dsw-alias-bg-overlay,#12171e);border:1px solid var(--dsw-alias-border-l2,#3c4654);
  box-shadow:0 18px 44px rgba(0,0,0,.55);color:var(--dsw-alias-label-primary,#e8edf2)}
.dsh-edgerunners-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;
  font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#fcee0a}
.dsh-edgerunners-panel-close{border:0;background:none;color:#8b98a5;font-size:18px;line-height:1;cursor:pointer;padding:0 2px}
.dsh-edgerunners-panel-close:hover{color:#ff7a1a}
.dsh-edgerunners-hop{animation:dsh-ed-h 320ms cubic-bezier(.2,.9,.3,1) 1}
.dsh-edgerunners-shake{animation:dsh-ed-s 90ms linear 4}
@keyframes dsh-ed-h{0%{transform:translateY(0)}35%{transform:translateY(-9px)}100%{transform:translateY(0)}}
@keyframes dsh-ed-s{0%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}100%{transform:translateX(0)}}
@media (prefers-reduced-motion: reduce){.dsh-edgerunners-sprite{transform:none!important}}
`

    // Базовые метрики спрайта: кадры 420×372, персонаж стоит по центру кадра.
    const SPRITE_BASE = 132
    const FRAME_ASPECT = 420 / 372
    const PANEL_WIDTH = 238

    function useViewport() {
      const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
      useEffect(() => {
        const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])
      return size
    }

    /**
     * Куда ставить колонку питомца: центр кадра держим на том же месте, что и при 100 %,
     * поэтому при увеличении герой растёт вокруг себя, а не уползает влево. Если окно
     * маленькое — прижимаем к краям, размер упирается в доступные ширину и высоту.
     */
    /**
     * Привязка к правому краю: на 100 % герой стоит в самом углу окна, а при увеличении
     * растёт влево — правый отступ всегда 18 px. Размер адаптируется под окно,
     * чтобы спрайт не вылезал за границы при уменьшении окна.
     */
    function layoutPet(scale, vw, vh) {
      const requested = SPRITE_BASE * (Number(scale) || 100) / 100
      const byWidth = Math.max(96, vw - 24)
      const byHeight = Math.max(96, vh * 0.8 * FRAME_ASPECT)
      const width = Math.round(Math.min(requested, byWidth, byHeight))
      const height = Math.round(width / FRAME_ASPECT)
      const column = Math.min(Math.max(PANEL_WIDTH, width), Math.max(120, vw - 16))
      const left = Math.max(8, Math.round(vw - 18 - column))
      return { width, height, left, column }
    }

    function Pet() {
      const scene = useScene()
      const running = Boolean(scene && scene.steps && scene.steps.length)
      const now = useTick(running)
      const [bubble, setBubble] = useState('')
      const bubbleTimer = useRef(0)
      const lastLine = useRef(-1)
      const open = usePanel()
      const vp = useViewport()

      const hero = scene && scene.hero ? scene.hero : 'kadr'
      const { frame, fx } = frameAt(scene, now)

      useEffect(() => {
        if (!scene) return
        const seq = scene.lineSeq === undefined ? 0 : scene.lineSeq
        if (seq === lastLine.current) return
        lastLine.current = seq
        if (!scene.line) return
        setBubble(`${scene.line}`)
        clearTimeout(bubbleTimer.current)
        bubbleTimer.current = setTimeout(() => setBubble(''), 6500)
      }, [scene && scene.lineSeq, scene && scene.line])

      useEffect(() => () => clearTimeout(bubbleTimer.current), [])

      if (!scene) return null
      const layout = layoutPet(scene.scale, vp.w, vp.h)
      const width = layout.width
      const version = scene.upstream && scene.upstream.version ? scene.upstream.version : ''
      const frames = Array.isArray(scene.steps) ? Array.from(new Set(scene.steps.map(step => step[0]))) : []

      return h('div', {
        className: 'dsh-edgerunners-pet',
        style: { left: `${layout.left}px`, width: `${layout.column}px` },
      },
        h('style', null, PET_CSS),
        bubble ? h('div', { className: 'dsh-edgerunners-bubble' },
          h('div', { className: 'dsh-edgerunners-tag' }, scene.name || HEROES[hero]),
          bubble,
        ) : null,
        h('button', {
          type: 'button',
          key: `${scene.seq}-${fx || 'still'}`,
          className: `dsh-edgerunners-sprite${fx === 'hop' ? ' dsh-edgerunners-hop' : ''}${fx === 'shake' ? ' dsh-edgerunners-shake' : ''}`,
          title: str(scene.lang).poke,
          'aria-label': str(scene.lang).poke,
          onClick: () => {
            // Ресурсные маршруты DSH принимают только GET.
            fetch('/edgerunners/poke', { cache: 'no-store' }).catch(() => {})
          },
        }, frame
          ? h('img', {
              src: frameSrc(hero, frame, version),
              srcSet: `${frameSrc2x(hero, frame, version)} 2x`,
              width,
              height: layout.height,
              alt: '',
              draggable: false,
            })
          : null,
        ),
        h(Hud),
        h('div', { className: 'dsh-edgerunners-preload', 'aria-hidden': true },
          frames.map(name => h('img', {
            key: name,
            src: frameSrc(hero, name, version),
            srcSet: `${frameSrc2x(hero, name, version)} 2x`,
            alt: '',
          })),
        ),
        open ? h('div', { className: 'dsh-edgerunners-panel' },
          h('div', { className: 'dsh-edgerunners-panel-head' },
            h('span', null, 'Edgerunners'),
            h('button', {
              type: 'button',
              className: 'dsh-edgerunners-panel-close',
              onClick: () => setPanel(false),
              'aria-label': str(scene.lang).close,
            }, '×'),
          ),
          h(Settings),
        ) : null,
      )
    }

    // --- HUD над промптом -------------------------------------------------

    const HUD_CSS = `
.dsh-edgerunners-hud{display:flex;align-items:center;justify-content:center;gap:6px;padding:2px 0 0;
  width:100%;max-width:238px;font-size:10px;letter-spacing:.8px;text-transform:uppercase;
  color:var(--dsw-text-secondary,#8b98a5);font-family:"Bahnschrift","Segoe UI",system-ui,sans-serif;
  user-select:none;-webkit-user-select:none;white-space:nowrap}
.dsh-edgerunners-hud button{pointer-events:auto}
.dsh-edgerunners-hud img{display:block;border-radius:2px;background:rgba(0,0,0,.25)}
.dsh-edgerunners-hud .hero{background:none;border:0;padding:0;color:#fcee0a;font:inherit;
  letter-spacing:.8px;text-transform:uppercase;cursor:pointer}
.dsh-edgerunners-hud .hero:hover{color:#ff7a1a}
.dsh-edgerunners-hud .status{color:#2ef2ff}
.dsh-edgerunners-hud .deed{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;max-width:112px}
.dsh-edgerunners-hud .dot{width:6px;height:6px;border-radius:50%;background:#2ef2ff;opacity:.7;
  box-shadow:0 0 6px #2ef2ff}
.dsh-edgerunners-hud .gear{border:0;background:none;color:var(--dsw-alias-label-secondary,#8b98a5);
  font-size:14px;line-height:1;padding:2px 4px;cursor:pointer;border-radius:4px}
.dsh-edgerunners-hud .gear:hover{color:#fcee0a;background:rgba(252,238,10,.08)}
`

    function Hud() {
      const scene = useScene()
      const hero = scene && scene.hero ? scene.hero : 'kadr'
      if (!scene) return null
      return h('div', { className: 'dsh-edgerunners-hud' },
        h('style', null, HUD_CSS),
        h('img', {
          src: frameSrc(hero, 'idle_01', scene.upstream && scene.upstream.version),
          width: 18,
          height: 24,
          alt: '',
          draggable: false,
        }),
        h('button', {
          type: 'button',
          className: 'hero',
          title: str(scene.lang).nextHero,
          onClick: () => {
            const index = HERO_IDS.indexOf(hero)
            const next = HERO_IDS[(index + 1) % HERO_IDS.length]
            saveHero(next)
            fetch(`/edgerunners/hero?hero=${encodeURIComponent(next)}`, { cache: 'no-store' }).catch(() => {})
          },
        }, scene.name || (scene.lang === 'en' ? LANG_NAMES[hero] : HEROES[hero]) || hero),
        h('span', { className: 'dot', 'aria-hidden': true }),
        h('span', { className: 'status' }, scene.status || ''),
        h('span', { className: 'deed' }, scene.deed || ''),
        h('button', {
          type: 'button',
          className: 'gear',
          title: str(scene.lang).settings,
          'aria-label': str(scene.lang).settings,
          onClick: () => setPanel(!panel.open),
        }, '⚙'),
      )
    }

    // --- Настройки --------------------------------------------------------

    const SETTINGS_CSS = `
.dsh-edgerunners-settings{display:flex;flex-direction:column;gap:22px;max-width:660px;
  color:var(--dsw-alias-label-primary,#e8edf2);font:13px/1.45 "Segoe UI",system-ui,sans-serif}
.dsh-edgerunners-settings h3{margin:0 0 8px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;
  color:var(--dsw-alias-label-secondary,#8b98a5);font-weight:600}
.dsh-edgerunners-settings p{margin:6px 0 0;color:var(--dsw-alias-label-secondary,#8b98a5);font-size:12px}
.dsh-edgerunners-heroes{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px}
.dsh-edgerunners-hero{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 8px 8px;
  border:1px solid var(--dsw-alias-border-l1,#2a323c);border-radius:8px;
  background:var(--dsw-alias-bg-layer-2,#161b22);cursor:pointer;font:inherit;color:inherit}
.dsh-edgerunners-hero:hover{border-color:var(--dsw-alias-border-l2,#3c4654)}
.dsh-edgerunners-hero[data-active="true"]{border-color:var(--dsw-alias-brand-primary,#fcee0a);
  box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#fcee0a) inset}
.dsh-edgerunners-hero img{width:34px;height:44px;object-fit:contain}
.dsh-edgerunners-hero b{font-size:13px;font-weight:600}
.dsh-edgerunners-hero span{font-size:11px;color:var(--dsw-alias-label-secondary,#8b98a5)}
.dsh-edgerunners-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dsh-edgerunners-row input[type="range"]{width:220px;accent-color:var(--dsw-alias-brand-primary,#fcee0a)}
.dsh-edgerunners-value{min-width:52px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#8b98a5)}
.dsh-edgerunners-button{padding:7px 14px;border-radius:7px;cursor:pointer;font:inherit;
  border:1px solid var(--dsw-alias-border-l2,#3c4654);background:var(--dsw-alias-bg-layer-2,#161b22);
  color:var(--dsw-alias-label-primary,#e8edf2)}
.dsh-edgerunners-button:hover{border-color:var(--dsw-alias-brand-primary,#fcee0a)}
.dsh-edgerunners-button[data-active="true"]{border-color:var(--dsw-alias-brand-primary,#fcee0a);
  color:var(--dsw-alias-brand-primary,#fcee0a)}
.dsh-edgerunners-button[disabled]{opacity:.55;cursor:default}
.dsh-edgerunners-update{display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l1,#2a323c);background:var(--dsw-alias-bg-layer-1,#11161c)}
.dsh-edgerunners-version{font-size:12px;color:var(--dsw-alias-label-secondary,#8b98a5)}
.dsh-edgerunners-notice{font-size:12px;color:var(--dsw-alias-brand-primary,#fcee0a);min-height:16px}
.dsh-edgerunners-error{font-size:12px;color:var(--dsw-alias-state-error-primary,#ff6b6b)}
`

    // Тексты интерфейса плагина: реплики героев приходят с хоста уже на выбранном языке.
    const STR = {
      ru: {
        loading: 'Загружаю настройки…',
        saveFailed: 'Не сохранилось',
        hero: 'Герой',
        heroHint: 'Питомец и HUD сразу переключаются на выбранного героя.',
        size: 'Размер',
        sizeHint: 'От 70 до 400 % от обычного размера спрайта. Герой стоит у правого края и при увеличении растёт влево.',
        sizeAria: 'Размер героя',
        lang: 'Язык',
        langHint: 'Реплики, HUD и эта страница переключаются сразу. Кадры и клипы от языка не зависят.',
        updates: 'Обновления',
        frames: (v) => `Кадры из оригинала: v${v}`,
        framesNone: 'Кадры ещё не сверялись с оригиналом',
        checked: ' · проверено: ',
        never: 'ещё не проверялось',
        autoport: (c) => `Автопорт: ${c.clips} клипов, ${c.lines} наборов реплик, ${c.heroes} героя`,
        autoportNone: 'Автопорт ещё не собран — нажми «Проверить обновления»',
        check: 'Проверить обновления',
        checking: 'Проверяю…',
        done: 'Готово',
        failed: 'Ошибка',
        about1: 'Плагин сверяет версию с ',
        about2: ', скачивает архив и сам переносит кадры, клипы, реплики и данные героев: исходники мода разбираются в изолированной песочнице, без выполнения их кода в приложении. Если в оригинале появится новый клип или реплика — они подключатся автоматически.',
        nextHero: 'Следующий герой',
        settings: 'Настройки edgerunners',
        poke: 'Позвать героя',
        close: 'Закрыть настройки',
        error: 'Ошибка',
      },
      en: {
        loading: 'Loading settings…',
        saveFailed: 'Not saved',
        hero: 'Hero',
        heroHint: 'The pet and the HUD switch to the chosen hero right away.',
        size: 'Size',
        sizeHint: '70 to 400 % of the normal sprite size. The hero hugs the right edge and grows leftwards.',
        sizeAria: 'Hero size',
        lang: 'Language',
        langHint: 'Lines, the HUD and this page switch immediately. Frames and clips do not depend on the language.',
        updates: 'Updates',
        frames: (v) => `Frames from the original: v${v}`,
        framesNone: 'Frames have not been checked against the original yet',
        checked: ' · checked: ',
        never: 'never checked',
        autoport: (c) => `Autoport: ${c.clips} clips, ${c.lines} line sets, ${c.heroes} heroes`,
        autoportNone: 'Autoport is not built yet — press “Check for updates”',
        check: 'Check for updates',
        checking: 'Checking…',
        done: 'Done',
        failed: 'Error',
        about1: 'The plugin compares versions with ',
        about2: ', downloads the archive and ports frames, clips, lines and hero data itself: the mod sources are parsed in an isolated sandbox without running their code in the app. If the original gains a new clip or line, it is picked up automatically.',
        nextHero: 'Next hero',
        settings: 'Edgerunners settings',
        poke: 'Call the hero',
        close: 'Close settings',
        error: 'Error',
      },
    }
    const str = (lang) => STR[lang === 'en' ? 'en' : 'ru']

    function Settings() {
      const [data, setData] = useState(null)
      const [scale, setScale] = useState(100)
      const [busy, setBusy] = useState('')
      const [notice, setNotice] = useState('')
      const [error, setError] = useState('')
      const timer = useRef(0)

      const refresh = () => fetch('/edgerunners/config', { cache: 'no-store' })
        .then((response) => response.json())
        .then((next) => {
          setData(next)
          setScale(next.scale)
        })

      useEffect(() => {
        let alive = true
        refresh().catch((reason) => { if (alive) setError(String((reason && reason.message) || reason)) })
        return () => { alive = false; clearTimeout(timer.current) }
      }, [])

      async function save(patch) {
        setError('')
        setBusy('save')
        try {
          const response = await fetch('/edgerunners/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          })
          const next = await response.json()
          if (!next || next.ok === false) throw new Error((next && next.error) || str(data && data.lang).saveFailed)
          setData(next)
          setScale(next.scale)
        } catch (reason) {
          setError(String((reason && reason.message) || reason))
        } finally {
          setBusy('')
        }
      }

      function changeScale(value) {
        const next = Number(value)
        setScale(next)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => { save({ scale: next }) }, 350)
      }

      async function checkUpdates() {
        setError('')
        setNotice(str(data && data.lang).checking)
        setBusy('update')
        try {
          const response = await fetch('/edgerunners/update', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          const next = await response.json()
          const L = str(data && data.lang)
          setNotice(next && next.message ? next.message : next && next.ok ? L.done : L.failed)
          await refresh()
        } catch (reason) {
          setNotice('')
          setError(String((reason && reason.message) || reason))
        } finally {
          setBusy('')
        }
      }

      const L = str(data && data.lang)

      if (!data) {
        return h('div', { className: 'dsh-edgerunners-settings' },
          h('style', null, SETTINGS_CSS),
          h('h3', null, 'Edgerunners'),
          error ? h('div', { className: 'dsh-edgerunners-error' }, error) : h('p', null, L.loading),
        )
      }

      const hero = data.hero
      const version = data.upstream && data.upstream.version
      const checked = data.upstream && data.upstream.checkedAt
      const checkedText = checked
        ? new Date(checked).toLocaleString(data.lang === 'en' ? 'en-US' : 'ru-RU')
        : L.never

      return h('div', { className: 'dsh-edgerunners-settings' },
        h('style', null, SETTINGS_CSS),

        h('section', null,
          h('h3', null, L.hero),
          h('div', { className: 'dsh-edgerunners-heroes' },
            HERO_IDS.map((id) => h('button', {
              key: id,
              type: 'button',
              className: 'dsh-edgerunners-hero',
              'data-active': String(id === hero),
              disabled: Boolean(busy),
              onClick: () => save({ hero: id }),
            },
              h('img', { src: frameSrc(id, 'idle_01', version), alt: '' }),
              h('b', null, data.lang === 'en' ? (LANG_NAMES[id] || HEROES[id]) : HEROES[id]),
            )),
          ),
          h('p', null, L.heroHint),
        ),

        h('section', null,
          h('h3', null, L.size),
          h('div', { className: 'dsh-edgerunners-row' },
            h('input', {
              type: 'range',
              min: 70,
              max: 400,
              step: 5,
              value: scale,
              'aria-label': L.sizeAria,
              onChange: (event) => changeScale(event.target.value),
            }),
            h('span', { className: 'dsh-edgerunners-value' }, `${scale}%`),
          ),
          h('p', null, L.sizeHint),
        ),

        h('section', null,
          h('h3', null, L.lang),
          h('div', { className: 'dsh-edgerunners-row' },
            [['ru', 'Русский'], ['en', 'English']].map(([id, label]) => h('button', {
              key: id,
              type: 'button',
              className: 'dsh-edgerunners-button',
              'data-active': String(id === (data.lang || 'ru')),
              disabled: Boolean(busy),
              onClick: () => save({ lang: id }),
            }, label)),
          ),
          h('p', null, L.langHint),
        ),

        h('section', null,
          h('h3', null, L.updates),
          h('div', { className: 'dsh-edgerunners-update' },
            h('div', { className: 'dsh-edgerunners-version' },
              version ? L.frames(version) : L.framesNone,
              L.checked, checkedText),
            h('div', { className: 'dsh-edgerunners-version' },
              data.compiled && data.compiled.clips ? L.autoport(data.compiled) : L.autoportNone),
            h('div', { className: 'dsh-edgerunners-row' },
              h('button', {
                type: 'button',
                className: 'dsh-edgerunners-button',
                disabled: Boolean(busy),
                onClick: checkUpdates,
              }, busy === 'update' ? L.checking : L.check),
              notice ? h('span', { className: 'dsh-edgerunners-notice' }, notice) : null,
            ),
            h('p', null,
              L.about1, h('b', null, 'Alexanderadon/edgerunners'), L.about2),
          ),
        ),

        error ? h('div', { className: 'dsh-edgerunners-error' }, error) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const offPet = ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'edgerunners-pet',
          order: 40,
          label: 'Edgerunners: питомец',
        }, Pet))

        const offSettings = ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'edgerunners',
          order: 25,
          label: 'Edgerunners',
        }, Settings))

        return () => {
          if (typeof offPet === 'function') offPet()
          if (typeof offSettings === 'function') offSettings()
        }
      },
    }
  },
})
