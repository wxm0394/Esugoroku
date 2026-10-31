import subprocess, os
cwd='/home/ou/Projects/E-Sugoroku'
def run(cmd):
    r=subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    print('$',' '.join(cmd))
    print((r.stdout or '')[:1200])
    if r.returncode: print('ERR', (r.stderr or '')[:800])
    return r.returncode
run(['git','add','-A'])
run(['git','commit','-m','V2: real ukiyo-e prints, single giant bone die, standee tokens, hop audio'])
run(['git','push','origin','main'])
