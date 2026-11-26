import { createElement as h, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { drawPose, motions, stageHeight, stageWidth } from './motion.mjs'
import { chooseIdleAction, selectActivity } from './state.mjs'

const atlasUrl = new URL('./poses.webp', import.meta.url).href
const oneShots = new Set(['success', 'failure', 'drift', 'run', 'recline'])
const labels = {
  en: {
    title: 'Agnes pet',
    interact: 'Give the pet a nudge',
    idle: 'Idle',
    thinking: 'Thinking',
    success: 'Completed',
    waiting: 'Waiting for input',
    working: 'Working',
    failure: 'Failed',
    drift: 'Drifting',
    run: 'Running',
    recline: 'Lounging',
  },
  zh: {
    title: 'Agnes 桌宠',
    interact: '戳一下桌宠',
    idle: '休息中',
    thinking: '思考中',
    success: '已完成',
    waiting: '等待输入',
    working: '工作中',
    failure: '执行失败',
    drift: '飘落',
    run: '跑动',
    recline: '躺平',
  },
}

function followSession(ctx, readiness, onAction) {
  if (readiness.status !== 'ready') return
  let stopped = false
  let dirty = true
  let pending = false
  let timer
  let previous
  const current = () => !stopped && ctx.session.readiness.getSnapshot() === readiness

  function schedule() {
    dirty = true
    if (!current() || document.hidden || pending || timer !== undefined) return
    timer = setTimeout(read, 220)
  }

  async function read() {
    timer = undefined
    const session = ctx.agnes.sessions.get(readiness.sessionId)
    if (!current() || !session || document.hidden) return
    dirty = false
    pending = true
    try {
      const result = await session.projectUIOpening({ maxNodes: 24, maxBytes: 98304 })
      if (!current() || document.hidden || result.timeline.sessionId !== readiness.sessionId) return
      previous = selectActivity(previous, result.timeline)
      onAction(previous.action)
    } catch {
      // A failed read has no authoritative state. The next session notification can refresh it.
      if (current()) onAction(undefined)
    } finally {
      pending = false
      if (dirty) schedule()
    }
  }

  const unsubscribe = ctx.session.projection.subscribe(schedule)
  document.addEventListener('visibilitychange', schedule)
  void read()
  return () => {
    stopped = true
    clearTimeout(timer)
    unsubscribe()
    document.removeEventListener('visibilitychange', schedule)
  }
}


function clearComposer(pet) {
  const selector = '[data-agnes-composer-dsh], form[data-agnes-region="composer"]'
  let composers = new Set()
  let frame

  function place() {
    let top = window.innerHeight
    for (const composer of composers) {
      const rect = composer.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && rect.bottom > 0) top = Math.min(top, rect.top)
    }
    if (top === window.innerHeight) {
      pet.style.removeProperty('--agnes-pet-clearance')
      pet.style.removeProperty('--agnes-pet-room-width')
      pet.removeAttribute('data-no-interaction-room')
      return
    }
    const clearance = window.innerHeight - top + 12
    const room = Math.max(0, top - 24)
    pet.style.setProperty('--agnes-pet-clearance', `${clearance}px`)
    pet.style.setProperty('--agnes-pet-room-width', `${room * stageWidth / stageHeight}px`)
    // An expanded composer can leave room to draw but no usable pointer or focus target.
    pet.toggleAttribute('data-no-interaction-room', room < 76)
  }

  const resize = new ResizeObserver(place)
  function refresh() {
    const next = new Set(document.querySelectorAll(selector))
    for (const el of composers) if (!next.has(el)) resize.unobserve(el)
    for (const el of next) if (!composers.has(el)) resize.observe(el)
    composers = next
    place()
  }

  function schedule() {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      refresh()
    })
  }

  const changes = new MutationObserver(schedule)
  changes.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', place)
  window.addEventListener('scroll', schedule, true)
  refresh()
  return () => {
    cancelAnimationFrame(frame)
    changes.disconnect()
    resize.disconnect()
    window.removeEventListener('resize', place)
    window.removeEventListener('scroll', schedule, true)
  }
}

function Pet({ ctx, readiness, language }) {
  const overlay = useRef(null)
  const canvas = useRef(null)
  const poke = useRef(() => {})
  const [action, setAction] = useState('idle')
  const [visible, setVisible] = useState(false)
  const text = language?.startsWith('zh') ? labels.zh : labels.en

  useLayoutEffect(() => clearComposer(overlay.current), [])

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const atlas = new Image()
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let disposed = false
    let loaded = false
    let animation
    let idleTimer
    let startedAt = 0
    let current = 'idle'
    let lastSurprise

    function stopDrawing() {
      cancelAnimationFrame(animation)
      animation = undefined
    }

    function change(next) {
      if (current === next) return
      current = next
      startedAt = performance.now()
      clearTimeout(idleTimer)
      idleTimer = undefined
      setAction(next)
      redraw()
      scheduleSurprise()
    }

    function frame(now) {
      animation = undefined
      const elapsed = Math.max(0, now - startedAt)
      const motion = motions[current]
      if (!motion.loop && elapsed >= motion.duration) {
        change('idle')
        return
      }
      drawPose(context, atlas, current, elapsed, reduced.matches)
      if (!reduced.matches || !motion.loop) animation = requestAnimationFrame(frame)
    }

    function redraw() {
      stopDrawing()
      if (loaded && !document.hidden) animation = requestAnimationFrame(frame)
    }

    function surprise() {
      if (!loaded || current !== 'idle' || document.hidden || reduced.matches) return
      // Only a known idle live session, or the empty workbench, may initiate an idle gesture.
      if (readiness.status !== 'no-session' && (readiness.status !== 'ready' || !knownIdle)) return
      lastSurprise = chooseIdleAction(lastSurprise)
      change(lastSurprise)
    }

    function scheduleSurprise() {
      clearTimeout(idleTimer)
      idleTimer = undefined
      if (!loaded || current !== 'idle' || document.hidden || reduced.matches) return
      if (readiness.status !== 'no-session' && !knownIdle) return
      idleTimer = setTimeout(surprise, 18000 + Math.random() * 26000)
    }

    function visibilityChanged() {
      clearTimeout(idleTimer)
      idleTimer = undefined
      if (document.hidden) {
        stopDrawing()
        if (readiness.status === 'ready') knownIdle = false
        return
      }
      redraw()
      scheduleSurprise()
    }

    let knownIdle = false
    const stopFollowing = followSession(ctx, readiness, (next) => {
      knownIdle = next === 'idle'
      if (next === undefined) {
        change('idle')
        return
      }
      if (next === 'idle' && oneShots.has(current)) return
      if (next === current) scheduleSurprise()
      else change(next)
    })

    poke.current = surprise
    atlas.onload = () => {
      if (disposed) return
      loaded = true
      setVisible(true)
      startedAt = performance.now()
      redraw()
      scheduleSurprise()
    }
    atlas.src = atlasUrl
    reduced.addEventListener('change', visibilityChanged)
    document.addEventListener('visibilitychange', visibilityChanged)

    return () => {
      disposed = true
      poke.current = () => {}
      stopFollowing?.()
      atlas.onload = null
      clearTimeout(idleTimer)
      stopDrawing()
      reduced.removeEventListener('change', visibilityChanged)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [ctx, readiness])

  return h(
    'div',
    { ref: overlay, className: 'agnes-desktop-pet', hidden: !visible },
    h('canvas', { ref: canvas, width: stageWidth, height: stageHeight, 'aria-hidden': true }),
    h('button', {
      type: 'button',
      className: 'agnes-desktop-pet__button',
      onClick: () => poke.current(),
      title: text.interact,
      'aria-label': text.interact,
    }),
    h('span', { className: 'agnes-desktop-pet__status', role: 'status' }, `${text.title} · ${text[action]}`),
  )
}

export function apply(ctx) {
  function BoundPet() {
    const readiness = useSyncExternalStore(ctx.session.readiness.subscribe, ctx.session.readiness.getSnapshot)
    const language = useSyncExternalStore(ctx.locale.subscribe, () => ctx.locale.locale)
    return h(Pet, { key: readiness.epoch, ctx, readiness, language })
  }

  const remove = ctx.slots.register({ name: 'shell.overlay', id: 'agnes-desktop-pet', priority: 50 }, () =>
    h(BoundPet),
  )
  ctx.effect(() => remove)
}
