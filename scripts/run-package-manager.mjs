import { spawn } from 'node:child_process'
import { packageManagerCommand } from './package-manager-command.mjs'

const [cli, ...args] = process.argv.slice(2)
const invocation = packageManagerCommand(cli, args)
const child = spawn(invocation.command, invocation.args, {
  stdio: 'inherit',
  windowsHide: true,
})
child.once('error', error => {
  console.error(error.message)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  process.exitCode = code ?? 1
  if (signal) process.kill(process.pid, signal)
})
