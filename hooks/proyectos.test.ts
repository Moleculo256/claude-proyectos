import { expect, mock, test } from 'claude-code/testing'

test('dos chats del mismo proyecto comparten instrucciones y quedan agrupados', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'proyecto' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__proyectos__guardar_nota' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'chat-1' }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.turns', () => ({ value: 0 }))
  on('command.run', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.compose', () => ({ sections: [] }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'proyecto', args: 'nuevo web' })
  await $.command.run({ command: 'proyecto', args: 'instrucciones Responde siempre en español' })
  await $.prompt.submit({ text: 'Arregla el login' })
  const out = await $.command.run({ command: 'proyecto', args: 'chats' })
  expect(out.text).toContain('Arregla el login')
  expect(out.text).toContain('claude --resume chat-1')

  const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
  expect(sections.map(s => s.text).join('\n')).toContain('Responde siempre en español')
})
