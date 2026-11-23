import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Chat, Db, Project, View } from '../types'

const PANE = 'proyectos'
const TOOL = 'mcp__proyectos__guardar_nota'
const empty: View = { db: { projects: {}, byCwd: {} }, active: null, isAskHidden: false }
const view = atom({ plugin: 'proyectos', key: 'view' } as const, empty, {
  shape: 'view-2',
})

const HELP = `/proyecto: agrupa chats que comparten instrucciones y memoria
  /proyecto                       muestra el proyecto activo y la lista
  /proyecto nuevo <nombre>        crea un proyecto y mete este chat en él
  /proyecto usar <nombre>         mete este chat en un proyecto existente
  /proyecto chats [nombre]        lista los chats del proyecto, con cómo reabrirlos
  /proyecto instrucciones <texto> fija las instrucciones del proyecto
  /proyecto nota <texto>          añade una nota a la memoria del proyecto
  /proyecto olvidar <n>           borra la nota número n
  /proyecto carpeta               asocia esta carpeta al proyecto activo (se activa solo)
  /proyecto salir                 saca este chat del proyecto
  /proyecto borrar <nombre>       elimina un proyecto
  /proyecto panel                 abre el panel lateral`

function normalize(db: Db): Db {
  const projects: Record<string, Project> = {}
  for (const [k, p] of Object.entries(db.projects ?? {})) {
    projects[k] = { name: p.name, instructions: p.instructions ?? '', notes: p.notes ?? [], chats: p.chats ?? [], updated: p.updated ?? 0 }
  }
  return { projects, byCwd: db.byCwd ?? {} }
}

async function save($: EngineInterface, fn: (v: View) => View) {
  const next = await update($, view, fn)
  await $.store.set('db', next.db)
}

function patch(s: View, name: string, fn: (p: Project) => Project): View {
  const cur = s.db.projects[name]
  if (!cur) return s
  return { ...s, db: { ...s.db, projects: { ...s.db.projects, [name]: fn(cur) } } }
}

function activeOf(v: View): Project | null {
  return (v.active && v.db.projects[v.active]) || null
}

function contextText(p: Project): string {
  return (
    `# Proyecto activo: ${p.name}\n` +
    `Este chat pertenece a un proyecto cuyos chats comparten instrucciones y memoria.\n\n` +
    `## Instrucciones del proyecto\n${p.instructions || '(ninguna todavía)'}\n\n` +
    `## Memoria del proyecto (notas de chats anteriores)\n` +
    (p.notes.length ? p.notes.map(n => `- ${n}`).join('\n') : '(vacía)') +
    `\n\nCuando tomes una decisión duradera, fijes una convención o dejes trabajo pendiente, ` +
    `guárdalo con la herramienta ${TOOL} para que los otros chats del proyecto lo sepan.`
  )
}

function fmtDate(t: number): string {
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ')
}

function chatList(p: Project): string {
  if (!p.chats.length) return `  (${p.name} aún no tiene chats)`
  return p.chats
    .slice()
    .reverse()
    .map(c => `  ${fmtDate(c.date)}  ${c.title}\n      claude --resume ${c.id}   (${c.cwd})`)
    .join('\n')
}

// Mete el chat actual en un proyecto: lo registra y, como el prompt de sistema
// de un chat ya empezado no cambia, le pasa el contexto como nota al modelo.
async function join($: EngineInterface, name: string, title: string) {
  const id = await $.session.id()
  const cwd = await $.session.cwd()
  const turns = await $.session.turns()
  await save($, s => {
    const withActive = { ...s, active: name }
    return patch(withActive, name, p => {
      const chats = p.chats.filter(c => c.id !== id)
      const old = p.chats.find(c => c.id === id)
      const chat: Chat = { id, cwd, title: title || old?.title || 'Chat sin título', date: old?.date ?? Date.now() }
      return { ...p, chats: [...chats, chat].slice(-200), updated: Date.now() }
    })
  })
  const p = activeOf(await read($, view))
  $.ui.status(`Proyecto: ${name}`)
  if (p && turns > 0) {
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: contextText(p) }] } })
  }
}

export const register: Register = on => {
  let title = ''

  on('session.start', async ($, e, next) => {
    title = ''
    const stored = (await $.store.get('db')) as Db | undefined
    const db = normalize(stored ?? empty.db)
    const auto = db.byCwd[e.cwd]
    const id = await $.session.id()
    const resumed = Object.values(db.projects).find(p => p.chats.some(c => c.id === id))
    const active = resumed?.name ?? (auto && db.projects[auto] ? auto : null)
    await update($, view, () => ({ db, active, isAskHidden: false }))
    await $.command.register({
      name: 'proyecto',
      description: 'Agrupa chats en proyectos con instrucciones y memoria compartidas',
      argumentHint: '[nuevo|usar|chats|instrucciones|nota|carpeta|salir|panel]',
    })
    await $.tool.register({
      name: 'guardar_nota',
      description:
        'Guarda una nota duradera en la memoria del proyecto activo (decisiones, convenciones, estado, pendientes) para que los demás chats del mismo proyecto la lean.',
      inputSchema: {
        type: 'object',
        properties: { nota: { type: 'string', description: 'Nota breve y autocontenida' } },
        required: ['nota'],
      },
      isDeferred: false,
    })
    if (active) $.ui.status(`Proyecto: ${active}`)

    return next(e)
  })

  // El primer mensaje del chat le da título y lo registra en su proyecto.
  on('prompt.submit', async ($, e, next) => {
    const out = await next(e)
    if (!title && !e.command && !e.isMeta && e.text.trim()) {
      title = e.text.trim().replace(/\s+/g, ' ').slice(0, 70)
      const v = await read($, view)
      if (v.active) await join($, v.active, title)
    }
    return out
  })

  on('command.run', { command: 'proyecto' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ').trim()
    const v = await read($, view)
    const p = activeOf(v)
    const cwd = await $.session.cwd()

    switch (sub.toLowerCase()) {
      case '': {
        const all = Object.values(v.db.projects)
        const list = all.length
          ? all.map(x => `${x.name === v.active ? '*' : '-'} ${x.name}: ${x.chats.length} chats, ${x.notes.length} notas`).join('\n')
          : '(no hay proyectos todavía)'
        const head = p
          ? `Este chat está en el proyecto: ${p.name}\nInstrucciones: ${p.instructions || '(sin definir)'}\n` +
            p.notes.map((n, i) => `  ${i + 1}. ${n}`).join('\n')
          : 'Este chat no está en ningún proyecto.'
        return { text: `${head}\n\nProyectos:\n${list}\n\n${HELP}` }
      }
      case 'panel':
        await $.ui.open({ id: PANE, title: 'Proyecto' })
        return { text: 'Panel abierto.' }
      case 'nuevo': {
        if (!arg) return { text: 'Falta el nombre.' }
        if (v.db.projects[arg]) return { text: `"${arg}" ya existe. Usa /proyecto usar ${arg}` }
        await save($, s => ({
          ...s,
          db: { ...s.db, projects: { ...s.db.projects, [arg]: { name: arg, instructions: '', notes: [], chats: [], updated: Date.now() } } },
        }))
        await join($, arg, title)
        return { text: `Proyecto "${arg}" creado y este chat añadido. Fija sus instrucciones con /proyecto instrucciones <texto>.` }
      }
      case 'usar': {
        if (!v.db.projects[arg]) return { text: `No existe "${arg}". Usa /proyecto nuevo ${arg}` }
        await join($, arg, title)
        return { text: `Este chat ahora pertenece a "${arg}" y ya tiene sus instrucciones y memoria.` }
      }
      case 'chats': {
        const target = arg ? v.db.projects[arg] : p
        if (target) return { text: `Chats de ${target.name}:\n${chatList(target)}` }
        const all = Object.values(v.db.projects)
        return { text: all.length ? all.map(x => `${x.name}:\n${chatList(x)}`).join('\n\n') : 'No hay proyectos.' }
      }
      case 'carpeta': {
        if (!p) return { text: 'Primero mete este chat en un proyecto.' }
        await save($, s => ({ ...s, db: { ...s.db, byCwd: { ...s.db.byCwd, [cwd]: p.name } } }))
        return { text: `Los chats nuevos en ${cwd} entrarán solos en "${p.name}".` }
      }
      case 'salir': {
        if (!p) return { text: 'Este chat no está en ningún proyecto.' }
        const id = await $.session.id()
        await save($, s => ({ ...patch(s, p.name, x => ({ ...x, chats: x.chats.filter(c => c.id !== id) })), active: null }))
        $.ui.status(undefined)
        return { text: `Este chat ya no pertenece a "${p.name}".` }
      }
      case 'instrucciones':
      case 'nota': {
        if (!p) return { text: 'Este chat no está en ningún proyecto. Usa /proyecto nuevo <nombre>.' }
        if (!arg) return { text: 'Falta el texto.' }
        await save($, s =>
          patch(s, p.name, cur =>
            sub === 'nota'
              ? { ...cur, notes: [...cur.notes, arg], updated: Date.now() }
              : { ...cur, instructions: arg, updated: Date.now() },
          ),
        )
        return { text: sub === 'nota' ? 'Nota guardada para todos los chats del proyecto.' : 'Instrucciones actualizadas; las verán los chats nuevos del proyecto.' }
      }
      case 'olvidar': {
        const i = Number(arg) - 1
        if (!p || !Number.isInteger(i) || i < 0 || i >= p.notes.length) return { text: 'Número de nota no válido.' }
        await save($, s => patch(s, p.name, cur => ({ ...cur, notes: cur.notes.filter((_, j) => j !== i) })))
        return { text: 'Nota borrada.' }
      }
      case 'borrar': {
        if (!v.db.projects[arg]) return { text: `No existe "${arg}".` }
        await save($, s => {
          const { [arg]: _gone, ...projects } = s.db.projects
          const byCwd = Object.fromEntries(Object.entries(s.db.byCwd).filter(([, n]) => n !== arg))
          return { ...s, active: s.active === arg ? null : s.active, db: { projects, byCwd } }
        })
        return { text: `Proyecto "${arg}" eliminado.` }
      }
      default:
        return { text: HELP }
    }
  })

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    const p = activeOf(await read($, view))
    if (!p) return out
    return { sections: [...out.sections, { id: 'proyectos:contexto', text: contextText(p), scope: 'session' as const }] }
  })

  on('tool.run', { tool: TOOL }, async ($, e) => {
    const nota = String((e.input as { nota?: unknown }).nota ?? '').trim()
    const p = activeOf(await read($, view))
    if (!p) return { deny: 'Este chat no está en ningún proyecto. El usuario puede usar /proyecto nuevo <nombre>.' }
    if (!nota) return { deny: 'Nota vacía.' }
    await save($, s => patch(s, p.name, cur => ({ ...cur, notes: [...cur.notes, nota].slice(-100), updated: Date.now() })))
    return { result: `Nota guardada en el proyecto "${p.name}".` }
  })

  // Al empezar un chat sin proyecto: botones para elegir a cuál pertenece.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    const names = Object.keys(v.db.projects)
    if (v.active || v.isAskHidden || names.length === 0 || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexWrap="wrap">
        <Text dimColor>¿Proyecto para este chat? </Text>
        {names.slice(0, 6).map(n => (
          <Button key={`p-${n}`} label={n} onPress={() => join($, n, title)} />
        ))}
        <Button key="none" label="Ninguno" onPress={() => update($, view, s => ({ ...s, isAskHidden: true }))} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const v = await read($, view)
    const p = activeOf(v)
    return (
      <Box flexDirection="column">
        <Text bold>{p ? p.name : 'Este chat no está en un proyecto'}</Text>
        {p && <Text>{p.instructions || '(sin instrucciones)'}</Text>}
        {p && <Text dimColor>Memoria ({p.notes.length}):</Text>}
        {p && p.notes.slice(-10).map(n => <Text>{`• ${n}`}</Text>)}
        {p && <Text dimColor>Chats ({p.chats.length}):</Text>}
        {p && p.chats.slice(-10).reverse().map(c => <Text>{`${fmtDate(c.date)} ${c.title}`}</Text>)}
        <Text dimColor>
          Proyectos: {Object.values(v.db.projects).map(x => `${x.name} (${x.chats.length})`).join(', ') || '—'}
        </Text>
      </Box>
    )
  })
}
