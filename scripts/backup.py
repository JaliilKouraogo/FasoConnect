"""Sauvegarde serveur chiffrée avec GnuPG et restauration de contrôle isolée."""
import argparse,pathlib,subprocess,tempfile,tarfile,json,hashlib,secrets,os,time,shutil,getpass
from paths import ROOT,private_dir,compose

args=argparse.ArgumentParser()
args.add_argument('action',choices=['create','verify'])
args.add_argument('--archive',type=pathlib.Path,required=True)
args.add_argument('--passphrase-file',type=pathlib.Path)
options=args.parse_args()
gpg=shutil.which('gpg')
if not gpg:
    bundled=pathlib.Path(os.environ.get('LOCALAPPDATA',''))/'Programs/Git/usr/bin/gpg.exe'
    if bundled.exists():gpg=str(bundled)
if not gpg:raise SystemExit('Installer GnuPG depuis sa source officielle pour les sauvegardes.')
def run(command,data=None,env=None):
    r=subprocess.run(command,input=data,capture_output=True,cwd=ROOT,env=env)
    if r.returncode:raise RuntimeError('Commande échouée : '+str(command[0])+' (aucun secret affiché)')
    return r.stdout
scratch=private_dir()/'work';scratch.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='faso-backup-',dir=scratch) as tmp:
    work=pathlib.Path(tmp)
    password_file=options.passphrase_file
    if not password_file:
        phrase=getpass.getpass('Phrase secrète de sauvegarde (16 caractères minimum) : ')
        if len(phrase)<16:raise SystemExit('Phrase secrète trop courte')
        password_file=work/'passphrase';password_file.write_text(phrase,encoding='utf-8');password_file.chmod(0o600)
    else:
        if len(password_file.read_text(encoding='utf-8').strip())<16:raise SystemExit('Phrase secrète trop courte')
    gpg_home=work/'gnupg';gpg_home.mkdir()
    gpg_home_arg=gpg_home.resolve().as_posix()
    if os.name=='nt' and 'git/usr/bin' in pathlib.Path(gpg).as_posix().lower():gpg_home_arg='/'+gpg_home_arg[0].lower()+gpg_home_arg[2:]
    gpg_base=[gpg,'--homedir',gpg_home_arg,'--batch','--yes','--pinentry-mode','loopback','--passphrase-file',str(password_file.resolve())]
    if options.action=='create':
        if options.archive.exists():raise SystemExit('Archive existante : choisir un nouveau nom')
        options.archive.parent.mkdir(parents=True,exist_ok=True)
        stopped=False
        try:
            run(compose()+['stop','proxy','admin','synapse','identity']);stopped=True
            for service,user,db in [('db','synapse','synapse'),('identity-db','keycloak','keycloak')]:
                (work/(db+'.dump')).write_bytes(run(compose()+['exec','-T',service,'pg_dump','-U',user,'-d',db,'-Fc']))
            for service,mount,name in [('synapse','/data','synapse.tar'),('proxy','/data','caddy.tar'),('admin','/admin-auth','admin-auth.tar')]:
                (work/name).write_bytes(run(compose()+['run','--rm','--no-deps','-T','--entrypoint','tar',service,'-C',mount,'-cf','-','.']))
            shutil.copyfile(private_dir()/'.env',work/'.env')
            shutil.copytree(ROOT/'config',work/'config')
            manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in work.iterdir() if p.is_file() and p.name!='passphrase'}
            (work/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
            archive=work/'server.tar'
            with tarfile.open(archive,'w') as tar:
                for p in work.iterdir():
                    if p!=archive and p.name!='passphrase':tar.add(p,arcname=p.name)
            run(gpg_base+['--symmetric','--cipher-algo','AES256','--output',str(options.archive.resolve()),str(archive)])
            print('PASS sauvegarde serveur chiffrée créée. Les clés des clients ne font pas partie de cette sauvegarde.')
        finally:
            if stopped:run(compose()+['up','-d'])
    else:
        clear=work/'server.tar';run(gpg_base+['--decrypt','--output',str(clear),str(options.archive.resolve())])
        restored=work/'restored';restored.mkdir()
        with tarfile.open(clear) as tar:tar.extractall(restored,filter='data')
        manifest=json.loads((restored/'manifest.json').read_text(encoding='utf-8'))
        for name,digest in manifest.items():
            file=restored/name
            if file.parent.resolve()!=restored.resolve():raise RuntimeError('Manifest invalide')
            if hashlib.sha256(file.read_bytes()).hexdigest()!=digest:raise RuntimeError('Empreinte invalide')
        with tarfile.open(restored/'synapse.tar') as tar:
            names={p.name.removeprefix('./') for p in tar}
            assert {'homeserver.yaml','signing.key','server-name'}.issubset(names)
        container='faso-restore-check-'+secrets.token_hex(6)
        env=os.environ.copy();env['POSTGRES_PASSWORD']=secrets.token_urlsafe(32)
        started=False
        try:
            run(['docker','run','-d','--name',container,'--network','none','-e','POSTGRES_PASSWORD','-e','POSTGRES_USER=synapse','-e','POSTGRES_DB=synapse','postgres:17.11-alpine'],env=env);started=True
            for attempt in range(60):
                check=subprocess.run(['docker','exec',container,'pg_isready','-U','synapse','-d','synapse'],capture_output=True)
                if check.returncode==0:break
                time.sleep(1)
            run(['docker','exec','-i',container,'pg_restore','-U','synapse','-d','synapse','--exit-on-error'],(restored/'synapse.dump').read_bytes())
            count=run(['docker','exec',container,'psql','-U','synapse','-d','synapse','-Atc','SELECT count(*) FROM events']).decode().strip()
            assert int(count)>0
            run(['docker','exec',container,'psql','-U','synapse','-d','postgres','-c','CREATE ROLE keycloak LOGIN'])
            run(['docker','exec',container,'createdb','-U','synapse','-O','keycloak','keycloak'])
            run(['docker','exec','-i',container,'pg_restore','-U','synapse','-d','keycloak','--exit-on-error'],(restored/'keycloak.dump').read_bytes())
            identities=run(['docker','exec',container,'psql','-U','synapse','-d','keycloak','-Atc','SELECT count(*) FROM user_entity']).decode().strip()
            assert int(identities)>0
            print('PASS archive intègre ; restaurations PostgreSQL Matrix et Keycloak réussies dans un conteneur sans réseau. Volumes serveur présents dans l’archive.')
        finally:
            if started:run(['docker','rm','-fv',container])
