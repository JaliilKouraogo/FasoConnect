import pathlib,time,shutil
source=pathlib.Path('/tls/caddy/pki/authorities/local/root.crt')
for attempt in range(120):
 if source.exists():break
 time.sleep(1)
else:raise SystemExit('Local authority unavailable')
shutil.copyfile(source,'/trust/root.crt')
pathlib.Path('/trust/root.crt').chmod(0o644)
