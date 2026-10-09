import { extname } from 'node:path'

export function packageManagerCommand(cli, args, nodeExecutable = process.execPath) {
  return extname(cli).toLowerCase() === '.exe'
    ? { command: cli, args }
    : { command: nodeExecutable, args: [cli, ...args] }
}
