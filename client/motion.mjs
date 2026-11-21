export const cellSize = 240
export const stageWidth = 360
export const stageHeight = 320

// The atlas has one row per action. Times are pose holds in milliseconds.
export const motions = {
  idle: { row: 0, frames: [0], holds: [2800], loop: true, poster: 0 },
  thinking: { row: 1, frames: [0, 1, 0, 2, 0], holds: [720, 760, 180, 125, 920], loop: true, poster: 0 },
  success: { row: 2, frames: [0, 1, 2, 3, 4], holds: [150, 125, 130, 130, 450], poster: 4 },
  waiting: { row: 3, frames: [0, 1, 2, 1], holds: [920, 800, 780, 540], loop: true, poster: 1 },
  working: { row: 4, frames: [0, 1, 0, 2], holds: [320, 175, 190, 175], loop: true, poster: 0 },
  failure: { row: 5, frames: [0, 1, 2], holds: [220, 270, 1400], poster: 2 },
  drift: { row: 6, frames: [0, 1, 2, 1, 2], holds: [510, 480, 460, 480, 580], poster: 1 },
  run: {
    row: 7,
    frames: [0, 1, 2, 1, 0, 1, 2, 1],
    holds: [145, 130, 145, 130, 145, 130, 145, 130],
    poster: 0,
  },
  recline: { row: 8, frames: [0, 1, 2], holds: [170, 185, 2750], poster: 2 },
}

for (const motion of Object.values(motions)) {
  motion.duration = motion.holds.reduce((total, duration) => total + duration, 0)
}

export function drawPose(context, atlas, action, elapsed, still = false) {
  const motion = motions[action]
  const time = motion.loop ? elapsed % motion.duration : Math.min(elapsed, motion.duration - 1)
  const progress = time / motion.duration
  let index = 0
  let remaining = time
  while (remaining >= motion.holds[index]) {
    remaining -= motion.holds[index]
    index++
  }
  const frame = still ? motion.poster : motion.frames[index]

  let x = 0
  let y = 0
  let tilt = 0
  let stretch = 1
  if (!still) {
    if (action === 'idle') stretch += Math.sin(progress * 2 * Math.PI) * 0.014
    if (action === 'success') {
      const landing = 535 / motion.duration
      y = -36 * Math.sin(Math.PI * Math.min(1, progress / landing))
    }
    if (action === 'drift') {
      const angle = progress * 4 * Math.PI
      x = 43 * Math.sin(angle) * Math.sin(Math.PI * progress)
      y = -102 * (1 - progress)
      tilt = 0.18 * Math.sin(angle)
    }
    if (action === 'run') {
      x = -62 + 124 * progress
      y = -7 * Math.abs(Math.sin(4 * Math.PI * progress))
    }
  }

  context.clearRect(0, 0, stageWidth, stageHeight)
  context.save()
  context.translate(stageWidth / 2 + x, stageHeight - 7 + y)
  context.rotate(tilt)
  context.scale(1, stretch)
  context.drawImage(
    atlas,
    frame * cellSize,
    motion.row * cellSize,
    cellSize,
    cellSize,
    -cellSize / 2,
    -cellSize,
    cellSize,
    cellSize,
  )
  context.restore()
}
