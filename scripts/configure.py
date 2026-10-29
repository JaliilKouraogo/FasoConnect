"""Configuration idempotente ; aucun secret affiché ou écrit dans OneDrive."""
import pathlib,secrets,json,argparse
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--domain',default='localhost')
parser.add_argument('--private-dir',type=pathlib.Path)
options=parser.parse_args()
domain=options.domain
if not domain or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789.-' for c in domain):
    raise SystemExit('Domaine invalide')
settings=ROOT/'local.settings.json'
if options.private_dir:
    private=options.private_dir.resolve()
elif settings.exists():
    private=pathlib.Path(json.loads(settings.read_text(encoding='utf-8'))['privateDirectory'])
elif any('onedrive' in part.lower() for part in ROOT.parts):
    private=pathlib.Path.home()/'Documents/Codex/FasoConnect-prive'
else:
    private=ROOT
if any('onedrive' in part.lower() for part in private.parts):
    raise SystemExit('Choisir un dossier privé hors de OneDrive pour les secrets.')
private.mkdir(parents=True,exist_ok=True)
env=private/'.env'
if env.exists():
    lines=dict(line.split('=',1) for line in env.read_text(encoding='utf-8').splitlines() if '=' in line and not line.startswith('#'))
    if lines.get('DOMAIN')!=domain:
        raise SystemExit('Le nom Matrix existant est immuable. Configuration conservée.')
else:
    keys=['POSTGRES_PASSWORD','OIDC_SECRET','IDENTITY_DB_PASSWORD','IDENTITY_ADMIN_PASSWORD','ADMIN_OIDC_SECRET','PROVISIONER_SECRET']
    env.write_text('DOMAIN='+domain+'\nHTTP_PORT=8088\nHTTPS_PORT=443\nBIND_ADDRESS=127.0.0.1\nAUDIT_RETENTION_DAYS=30\n'+''.join(k+'='+secrets.token_hex(32)+'\n' for k in keys),encoding='utf-8')
    env.chmod(0o600)
settings.write_text(json.dumps({'privateDirectory':str(private)}),encoding='utf-8')
print('Configuration prête. Secrets conservés hors de OneDrive ; aucune valeur affichée.')
