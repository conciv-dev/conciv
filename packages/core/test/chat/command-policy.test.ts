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
