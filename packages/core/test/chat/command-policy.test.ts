import {describe, it, expect} from 'vitest'
import {classifyCommand} from '../../src/chat/gate.js'

describe('classifyCommand', () => {
  it('allows read-only commands and gates mutating ones', () => {
    expect(classifyCommand('ls')).toBe('allow')
    expect(classifyCommand('ls -la')).toBe('allow')
    expect(classifyCommand('git status')).toBe('allow')
    expect(classifyCommand('git status --short')).toBe('allow')
    expect(classifyCommand('git push')).toBe('ask')
    expect(classifyCommand('rm file')).toBe('ask')
    expect(classifyCommand('rm -rf dist')).toBe('ask')
    expect(classifyCommand('')).toBe('ask')
  })

  it('never lets a safe prefix hide a risky suffix behind a shell metacharacter', () => {
    expect(classifyCommand('ls; rm -rf /')).toBe('ask')
    expect(classifyCommand('ls;rm -rf /')).toBe('ask')
    expect(classifyCommand('cat a | sh')).toBe('ask')
    expect(classifyCommand('true && rm -rf /')).toBe('ask')
    expect(classifyCommand('echo $(rm -rf /)')).toBe('ask')
    expect(classifyCommand('ls `rm -rf /`')).toBe('ask')
    expect(classifyCommand('echo hi > /etc/passwd')).toBe('ask')
    expect(classifyCommand('head < secret')).toBe('ask')
    expect(classifyCommand('ls -la\nrm -rf /')).toBe('ask')
    expect(classifyCommand('ls a\nb\nrm -rf /')).toBe('ask')
  })

  it('allows only catalog-derived read-only CLI commands, and gates everything else', () => {
    const allows = ['conciv tools page snapshot', 'conciv tools page snapshot *', 'conciv tools page changes']
    expect(classifyCommand('conciv tools page snapshot', allows)).toBe('allow')
    expect(classifyCommand('conciv tools page changes', allows)).toBe('allow')
    expect(classifyCommand('conciv tools page click --selector .buy', allows)).toBe('ask')
    expect(classifyCommand('conciv tools page snapshot', [])).toBe('ask')
    expect(classifyCommand('conciv tools page changes | tee evil.txt', allows)).toBe('ask')
    expect(classifyCommand('conciv ui confirm --question x', allows)).toBe('ask')
  })
})

describe('classifyCommand on compound read-only pipelines', () => {
  it('allows simple read-only segments joined by &&, ; and |', () => {
    expect(classifyCommand('cd packages/core && grep -rn needle src | head -20')).toBe('allow')
    expect(classifyCommand('cd /tmp; ls -la')).toBe('allow')
    expect(classifyCommand('git status --short | wc -l')).toBe('allow')
    expect(classifyCommand('cd packages/core && git log --oneline -5')).toBe('allow')
    expect(classifyCommand('cd x&&ls')).toBe('allow')
  })

  it('tolerates the literal 2>/dev/null and nothing else redirect-shaped', () => {
    expect(classifyCommand('cat missing.txt 2>/dev/null | grep needle')).toBe('allow')
    expect(classifyCommand('ls 2>/dev/null')).toBe('allow')
    expect(classifyCommand('ls 2>/tmp/out')).toBe('ask')
    expect(classifyCommand('ls > out.txt')).toBe('ask')
    expect(classifyCommand('ls >> out.txt')).toBe('ask')
    expect(classifyCommand('cat < in.txt')).toBe('ask')
  })

  it('asks for every compound command with one segment outside the read-only set', () => {
    expect(classifyCommand('cd packages/core && pnpm build')).toBe('ask')
    expect(classifyCommand('ls && rm -rf /')).toBe('ask')
    expect(classifyCommand('grep -rn needle . | xargs rm')).toBe('ask')
    expect(classifyCommand('ls | sudo tee /etc/passwd')).toBe('ask')
  })

  it('asks whenever a quote, escape or expansion could hide a separator', () => {
    expect(classifyCommand('grep "a;b" file')).toBe('ask')
    expect(classifyCommand("grep 'a && b' file")).toBe('ask')
    expect(classifyCommand('grep a\\;b file')).toBe('ask')
    expect(classifyCommand('echo $(whoami)')).toBe('ask')
    expect(classifyCommand('echo ${HOME}')).toBe('ask')
    expect(classifyCommand('ls $HOME')).toBe('ask')
    expect(classifyCommand('ls `id`')).toBe('ask')
    expect(classifyCommand('ls ~/secrets')).toBe('ask')
    expect(classifyCommand('ls !!')).toBe('ask')
    expect(classifyCommand('cat (a)')).toBe('ask')
  })

  it('asks for a heredoc, a background job, an or-list and a subshell runner', () => {
    expect(classifyCommand('cat <<EOF')).toBe('ask')
    expect(classifyCommand('cat <<-EOF\nrm -rf /\nEOF')).toBe('ask')
    expect(classifyCommand('ls &')).toBe('ask')
    expect(classifyCommand('ls & rm -rf /')).toBe('ask')
    expect(classifyCommand('ls || rm -rf /')).toBe('ask')
    expect(classifyCommand('sh -c ls')).toBe('ask')
    expect(classifyCommand('sh -c "ls"')).toBe('ask')
    expect(classifyCommand('bash -lc ls')).toBe('ask')
    expect(classifyCommand('ls && ')).toBe('ask')
    expect(classifyCommand('| grep x')).toBe('ask')
  })

  it('asks for read-only heads that can be turned into a command runner', () => {
    expect(classifyCommand('env rm -rf /')).toBe('ask')
    expect(classifyCommand('env FOO=1 ls')).toBe('ask')
    expect(classifyCommand('env')).toBe('allow')
    expect(classifyCommand('find . -delete')).toBe('ask')
    expect(classifyCommand('find . -name x -exec rm {} +')).toBe('ask')
    expect(classifyCommand('cd repo && find . -delete')).toBe('ask')
    expect(classifyCommand('find . -name x -type f')).toBe('allow')
  })
})

describe('classifyCommand on git subcommands that only look read-only', () => {
  it('allows list-shaped git branch', () => {
    expect(classifyCommand('git branch')).toBe('allow')
    expect(classifyCommand('git branch -a')).toBe('allow')
    expect(classifyCommand('git branch -r')).toBe('allow')
    expect(classifyCommand('git branch -v')).toBe('allow')
    expect(classifyCommand('git branch -vv')).toBe('allow')
    expect(classifyCommand('git branch --list')).toBe('allow')
    expect(classifyCommand('git branch --show-current')).toBe('allow')
    expect(classifyCommand('git branch --merged')).toBe('allow')
    expect(classifyCommand('git branch --no-merged')).toBe('allow')
    expect(classifyCommand('git branch --contains')).toBe('allow')
    expect(classifyCommand('git branch --sort=-committerdate')).toBe('allow')
    expect(classifyCommand('git branch -a --sort=refname')).toBe('allow')
    expect(classifyCommand('cd repo && git branch --list')).toBe('allow')
  })

  it('asks for a git branch that creates, deletes, renames, copies or repoints a branch', () => {
    expect(classifyCommand('git branch shipit')).toBe('ask')
    expect(classifyCommand('git branch shipit origin/main')).toBe('ask')
    expect(classifyCommand('git branch -d shipit')).toBe('ask')
    expect(classifyCommand('git branch -D shipit')).toBe('ask')
    expect(classifyCommand('git branch --delete --force shipit')).toBe('ask')
    expect(classifyCommand('git branch -m old new')).toBe('ask')
    expect(classifyCommand('git branch -M main')).toBe('ask')
    expect(classifyCommand('git branch --move old new')).toBe('ask')
    expect(classifyCommand('git branch -c old new')).toBe('ask')
    expect(classifyCommand('git branch -C old new')).toBe('ask')
    expect(classifyCommand('git branch --copy old new')).toBe('ask')
    expect(classifyCommand('git branch --set-upstream-to=origin/main')).toBe('ask')
    expect(classifyCommand('git branch --unset-upstream')).toBe('ask')
    expect(classifyCommand('git branch --list release-*')).toBe('ask')
    expect(classifyCommand('cd repo && git branch -D main')).toBe('ask')
    expect(classifyCommand('git branch --list | wc -l')).toBe('allow')
  })

  it('asks whenever a git segment writes its output to a file', () => {
    expect(classifyCommand('git diff')).toBe('allow')
    expect(classifyCommand('git diff --stat main')).toBe('allow')
    expect(classifyCommand('git diff --output=/etc/cron.d/pwn')).toBe('ask')
    expect(classifyCommand('git diff --output /etc/cron.d/pwn')).toBe('ask')
    expect(classifyCommand('git log --output=out.txt')).toBe('ask')
    expect(classifyCommand('git show --output=out.txt HEAD')).toBe('ask')
    expect(classifyCommand('git status --short && git diff --output=out.txt')).toBe('ask')
  })

  it('does not veto git flags that merely start like --output', () => {
    expect(classifyCommand('git diff --output-indicator-new=+')).toBe('allow')
    expect(classifyCommand('git log --output-indicator-old=-')).toBe('allow')
    expect(classifyCommand('git diff --output-indicator-context=%')).toBe('allow')
  })
})

describe('classifyCommand on read-only heads carrying a flag that writes or executes', () => {
  it('asks for ripgrep flags that run a command of the caller choosing', () => {
    expect(classifyCommand('rg --pre=curl needle .')).toBe('ask')
    expect(classifyCommand('rg --pre curl needle .')).toBe('ask')
    expect(classifyCommand('rg --hostname-bin=id needle')).toBe('ask')
    expect(classifyCommand('rg --hostname-bin id needle')).toBe('ask')
    expect(classifyCommand('cd repo && rg --pre=sh needle')).toBe('ask')
    expect(classifyCommand('rg needle .')).toBe('allow')
    expect(classifyCommand('rg -n --pre-glob *.pdf needle')).toBe('allow')
    expect(classifyCommand('rg --generate=man')).toBe('allow')
  })

  it('asks for grep flags that filter through, page into or save to a command or file', () => {
    expect(classifyCommand('grep --filter=*:sh needle file')).toBe('ask')
    expect(classifyCommand('grep --filter *:sh needle file')).toBe('ask')
    expect(classifyCommand('grep --pager=sh needle file')).toBe('ask')
    expect(classifyCommand('grep --pager needle file')).toBe('ask')
    expect(classifyCommand('grep --view=sh needle file')).toBe('ask')
    expect(classifyCommand('grep --save-config=/etc/profile.d/pwn')).toBe('ask')
    expect(classifyCommand('grep --save-config')).toBe('ask')
    expect(classifyCommand('grep --config=evil.cfg needle')).toBe('ask')
    expect(classifyCommand('grep ---evil.cfg needle')).toBe('ask')
    expect(classifyCommand('grep -rn needle src')).toBe('allow')
    expect(classifyCommand('grep --filter-magic-label=+LABEL:MAGIC needle')).toBe('allow')
  })

  it('asks for date forms that set the system clock', () => {
    expect(classifyCommand('date')).toBe('allow')
    expect(classifyCommand('date -u')).toBe('allow')
    expect(classifyCommand('date +%Y-%m-%d')).toBe('allow')
    expect(classifyCommand('date -u +%s')).toBe('allow')
    expect(classifyCommand('date --iso-8601=seconds')).toBe('allow')
    expect(classifyCommand('date 202001010000')).toBe('ask')
    expect(classifyCommand('date 0101000020')).toBe('ask')
    expect(classifyCommand('date -s 2020-01-01')).toBe('ask')
    expect(classifyCommand('date --set=2020-01-01')).toBe('ask')
    expect(classifyCommand('date -f fmt 2020-01-01')).toBe('ask')
  })

  it('leaves the swept heads that have no write or exec flag alone', () => {
    expect(classifyCommand('cd packages/core')).toBe('allow')
    expect(classifyCommand('ls -la --color=never')).toBe('allow')
    expect(classifyCommand('cat README.md')).toBe('allow')
    expect(classifyCommand('pwd -P')).toBe('allow')
    expect(classifyCommand('echo hello')).toBe('allow')
    expect(classifyCommand('head -n 20 file')).toBe('allow')
    expect(classifyCommand('tail -n 20 file')).toBe('allow')
    expect(classifyCommand('wc -l file')).toBe('allow')
    expect(classifyCommand('which node')).toBe('allow')
    expect(classifyCommand('true')).toBe('allow')
    expect(classifyCommand('git status --short')).toBe('allow')
    expect(classifyCommand('git log --oneline -5')).toBe('allow')
    expect(classifyCommand('git show --stat')).toBe('allow')
  })
})
