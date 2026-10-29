import pathlib,time,shutil,subprocess,os

cert=pathlib.Path('/trust/root.crt')

for attempt in range(120):

 if cert.exists():break

 time.sleep(1)

else:raise SystemExit('Autorité locale Caddy indisponible')

shutil.copyfile(cert,'/usr/local/share/ca-certificates/fasoconnect.crt')

subprocess.run(['update-ca-certificates'],check=True,stdout=subprocess.DEVNULL)

os.execv('/start.py',['/start.py'])

