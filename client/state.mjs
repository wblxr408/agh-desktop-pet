export function selectActivity(previous, timeline) {
  const turn = timeline.turns.at(-1)
  const op = timeline.opState
  const turnId = turn?.id
  const status = turn?.status
  let action = 'idle'
  const waitingForUser = timeline.nodes?.some((node) => {
    if (!turn?.nodeIds?.includes(node.id)) return false
    if (node.kind === 'approval') return node.state === 'pending'
    return node.kind === 'tool' && node.name === 'ask_user_question' && node.status === 'running'
  })

  if (waitingForUser || status === 'waiting' || op?.phase === 'parked' || op?.parked) {
    action = 'waiting'
  } else if (op || status === 'running') {
    action = op?.phase === 'inference' || !op || op.phase === 'running' ? 'thinking' : 'working'
    if (action === 'thinking' && turn?.nodeIds?.length) {
      const lastId = turn.nodeIds.at(-1)
      const lastNode = timeline.nodes?.findLast((node) => node.id === lastId)
      if (lastNode?.kind === 'assistant' && lastNode.streaming && lastNode.text) {
        action = 'working'
      }
    }
  } else if (previous && turnId && (turnId !== previous.turnId || status !== previous.status)) {
    if (status === 'completed') action = 'success'
    if (status === 'failed') action = 'failure'
  }

  return { action, turnId, status }
}

const surprises = ['drift', 'run', 'recline']

export function chooseIdleAction(previous, random = Math.random) {
  const choices = surprises.filter((action) => action !== previous)
  return choices[Math.floor(random() * choices.length)]
}
