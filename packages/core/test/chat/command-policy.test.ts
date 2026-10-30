import {describe, it, expect} from 'vitest'
import {classifyCommand} from '@conciv/chat/gate'
import {readOnlyCommandAllows} from '../../src/command-policy.js'

const classify = (command: string, extraAllows: readonly string[] = []) =>
  classifyCommand(command, [...readOnlyCommandAllows, ...extraAllows])

describe('classifyCommand', () => {
  it('allows read-only commands and gates mutating ones', () => {
    expect(classify('ls')).toBe('allow')
    expect(classify('ls -la')).toBe('allow')
    expect(classify('git status')).toBe('allow')
    expect(classify('git status --short')).toBe('allow')
    expect(classify('git push')).toBe('ask')
    expect(classify('rm file')).toBe('ask')
    expect(classify('rm -rf dist')).toBe('ask')
    expect(classify('')).toBe('ask')
  })

  it('never lets a safe prefix hide a risky suffix behind a shell metacharacter', () => {
    expect(classify('ls; rm -rf /')).toBe('ask')
    expect(classify('ls;rm -rf /')).toBe('ask')
    expect(classify('cat a | sh')).toBe('ask')
    expect(classify('true && rm -rf /')).toBe('ask')
    expect(classify('echo $(rm -rf /)')).toBe('ask')
    expect(classify('ls `rm -rf /`')).toBe('ask')
    expect(classify('echo hi > /etc/passwd')).toBe('ask')
    expect(classify('head < secret')).toBe('ask')
    expect(classify('ls -la\nrm -rf /')).toBe('ask')
    expect(classify('ls a\nb\nrm -rf /')).toBe('ask')
  })

  it('allows only catalog-derived read-only CLI commands, and gates everything else', () => {
    const allows = ['conciv tools page snapshot', 'conciv tools page snapshot *', 'conciv tools page changes']
    expect(classify('conciv tools page snapshot', allows)).toBe('allow')
    expect(classify('conciv tools page changes', allows)).toBe('allow')
    expect(classify('conciv tools page click --selector .buy', allows)).toBe('ask')
    expect(classify('conciv tools page snapshot', [])).toBe('ask')
    expect(classify('conciv tools page changes | tee evil.txt', allows)).toBe('ask')
    expect(classify('conciv ui confirm --question x', allows)).toBe('ask')
  })
})

describe('classifyCommand on compound read-only pipelines', () => {
  it('allows simple read-only segments joined by &&, ; and |', () => {
    expect(classify('cd packages/core && grep -rn needle src | head -20')).toBe('allow')
    expect(classify('cd /tmp; ls -la')).toBe('allow')
    expect(classify('git status --short | wc -l')).toBe('allow')
    expect(classify('cd packages/core && git log --oneline -5')).toBe('allow')
    expect(classify('cd x&&ls')).toBe('allow')
  })

  it('tolerates the literal 2>/dev/null and nothing else redirect-shaped', () => {
    expect(classify('cat missing.txt 2>/dev/null | grep needle')).toBe('allow')
    expect(classify('ls 2>/dev/null')).toBe('allow')
    expect(classify('ls 2>/tmp/out')).toBe('ask')
    expect(classify('ls > out.txt')).toBe('ask')
    expect(classify('ls >> out.txt')).toBe('ask')
    expect(classify('cat < in.txt')).toBe('ask')
  })

  it('asks for every compound command with one segment outside the read-only set', () => {
    expect(classify('cd packages/core && pnpm build')).toBe('ask')
    expect(classify('ls && rm -rf /')).toBe('ask')
    expect(classify('grep -rn needle . | xargs rm')).toBe('ask')
    expect(classify('ls | sudo tee /etc/passwd')).toBe('ask')
  })

  it('asks whenever a quote, escape or expansion could hide a separator', () => {
    expect(classify('grep "a;b" file')).toBe('ask')
    expect(classify("grep 'a && b' file")).toBe('ask')
    expect(classify('grep a\\;b file')).toBe('ask')
    expect(classify('echo $(whoami)')).toBe('ask')
    expect(classify('echo ${HOME}')).toBe('ask')
    expect(classify('ls $HOME')).toBe('ask')
    expect(classify('ls `id`')).toBe('ask')
    expect(classify('ls ~/secrets')).toBe('ask')
    expect(classify('ls !!')).toBe('ask')
    expect(classify('cat (a)')).toBe('ask')
  })

  it('asks for a heredoc, a background job, an or-list and a subshell runner', () => {
    expect(classify('cat <<EOF')).toBe('ask')
    expect(classify('cat <<-EOF\nrm -rf /\nEOF')).toBe('ask')
    expect(classify('ls &')).toBe('ask')
    expect(classify('ls & rm -rf /')).toBe('ask')
    expect(classify('ls || rm -rf /')).toBe('ask')
    expect(classify('sh -c ls')).toBe('ask')
    expect(classify('sh -c "ls"')).toBe('ask')
    expect(classify('bash -lc ls')).toBe('ask')
    expect(classify('ls && ')).toBe('ask')
    expect(classify('| grep x')).toBe('ask')
  })

  it('asks for read-only heads that can be turned into a command runner', () => {
    expect(classify('env rm -rf /')).toBe('ask')
    expect(classify('env FOO=1 ls')).toBe('ask')
    expect(classify('env')).toBe('allow')
    expect(classify('find . -delete')).toBe('ask')
    expect(classify('find . -name x -exec rm {} +')).toBe('ask')
    expect(classify('cd repo && find . -delete')).toBe('ask')
    expect(classify('find . -name x -type f')).toBe('allow')
  })
})

describe('classifyCommand on git subcommands that only look read-only', () => {
  it('allows list-shaped git branch', () => {
    expect(classify('git branch')).toBe('allow')
    expect(classify('git branch -a')).toBe('allow')
    expect(classify('git branch -r')).toBe('allow')
    expect(classify('git branch -v')).toBe('allow')
    expect(classify('git branch -vv')).toBe('allow')
    expect(classify('git branch --list')).toBe('allow')
    expect(classify('git branch --show-current')).toBe('allow')
    expect(classify('git branch --merged')).toBe('allow')
    expect(classify('git branch --no-merged')).toBe('allow')
    expect(classify('git branch --contains')).toBe('allow')
    expect(classify('git branch --sort=-committerdate')).toBe('allow')
    expect(classify('git branch -a --sort=refname')).toBe('allow')
    expect(classify('cd repo && git branch --list')).toBe('allow')
  })

  it('asks for a git branch that creates, deletes, renames, copies or repoints a branch', () => {
    expect(classify('git branch shipit')).toBe('ask')
    expect(classify('git branch shipit origin/main')).toBe('ask')
    expect(classify('git branch -d shipit')).toBe('ask')
    expect(classify('git branch -D shipit')).toBe('ask')
    expect(classify('git branch --delete --force shipit')).toBe('ask')
    expect(classify('git branch -m old new')).toBe('ask')
    expect(classify('git branch -M main')).toBe('ask')
    expect(classify('git branch --move old new')).toBe('ask')
    expect(classify('git branch -c old new')).toBe('ask')
    expect(classify('git branch -C old new')).toBe('ask')
    expect(classify('git branch --copy old new')).toBe('ask')
    expect(classify('git branch --set-upstream-to=origin/main')).toBe('ask')
    expect(classify('git branch --unset-upstream')).toBe('ask')
    expect(classify('git branch --list release-*')).toBe('ask')
    expect(classify('cd repo && git branch -D main')).toBe('ask')
    expect(classify('git branch --list | wc -l')).toBe('allow')
  })

  it('asks whenever a git segment writes its output to a file', () => {
    expect(classify('git diff')).toBe('allow')
    expect(classify('git diff --stat main')).toBe('allow')
    expect(classify('git diff --output=/etc/cron.d/pwn')).toBe('ask')
    expect(classify('git diff --output /etc/cron.d/pwn')).toBe('ask')
    expect(classify('git log --output=out.txt')).toBe('ask')
    expect(classify('git show --output=out.txt HEAD')).toBe('ask')
    expect(classify('git status --short && git diff --output=out.txt')).toBe('ask')
  })

  it('does not veto git flags that merely start like --output', () => {
    expect(classify('git diff --output-indicator-new=+')).toBe('allow')
    expect(classify('git log --output-indicator-old=-')).toBe('allow')
    expect(classify('git diff --output-indicator-context=%')).toBe('allow')
  })
})

describe('classifyCommand on read-only heads carrying a flag that writes or executes', () => {
  it('asks for ripgrep flags that run a command of the caller choosing', () => {
    expect(classify('rg --pre=curl needle .')).toBe('ask')
    expect(classify('rg --pre curl needle .')).toBe('ask')
    expect(classify('rg --hostname-bin=id needle')).toBe('ask')
    expect(classify('rg --hostname-bin id needle')).toBe('ask')
    expect(classify('cd repo && rg --pre=sh needle')).toBe('ask')
    expect(classify('rg needle .')).toBe('allow')
    expect(classify('rg -n --pre-glob *.pdf needle')).toBe('allow')
    expect(classify('rg --generate=man')).toBe('allow')
  })

  it('asks for grep flags that filter through, page into or save to a command or file', () => {
    expect(classify('grep --filter=*:sh needle file')).toBe('ask')
    expect(classify('grep --filter *:sh needle file')).toBe('ask')
    expect(classify('grep --pager=sh needle file')).toBe('ask')
    expect(classify('grep --pager needle file')).toBe('ask')
    expect(classify('grep --view=sh needle file')).toBe('ask')
    expect(classify('grep --save-config=/etc/profile.d/pwn')).toBe('ask')
    expect(classify('grep --save-config')).toBe('ask')
    expect(classify('grep --config=evil.cfg needle')).toBe('ask')
    expect(classify('grep ---evil.cfg needle')).toBe('ask')
    expect(classify('grep -rn needle src')).toBe('allow')
    expect(classify('grep --filter-magic-label=+LABEL:MAGIC needle')).toBe('allow')
  })

  it('asks for date forms that set the system clock', () => {
    expect(classify('date')).toBe('allow')
    expect(classify('date -u')).toBe('allow')
    expect(classify('date +%Y-%m-%d')).toBe('allow')
    expect(classify('date -u +%s')).toBe('allow')
    expect(classify('date --iso-8601=seconds')).toBe('allow')
    expect(classify('date 202001010000')).toBe('ask')
    expect(classify('date 0101000020')).toBe('ask')
    expect(classify('date -s 2020-01-01')).toBe('ask')
    expect(classify('date --set=2020-01-01')).toBe('ask')
    expect(classify('date -f fmt 2020-01-01')).toBe('ask')
  })

  it('leaves the swept heads that have no write or exec flag alone', () => {
    expect(classify('cd packages/core')).toBe('allow')
    expect(classify('ls -la --color=never')).toBe('allow')
    expect(classify('cat README.md')).toBe('allow')
    expect(classify('pwd -P')).toBe('allow')
    expect(classify('echo hello')).toBe('allow')
    expect(classify('head -n 20 file')).toBe('allow')
    expect(classify('tail -n 20 file')).toBe('allow')
    expect(classify('wc -l file')).toBe('allow')
    expect(classify('which node')).toBe('allow')
    expect(classify('true')).toBe('allow')
    expect(classify('git status --short')).toBe('allow')
    expect(classify('git log --oneline -5')).toBe('allow')
    expect(classify('git show --stat')).toBe('allow')
  })
})
