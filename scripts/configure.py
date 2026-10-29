"""Configure localhost test deployment without printing secrets."""
import pathlib,secrets,json,argparse
p=pathlib.Path(__file__).resolve().parents[1]
a=argparse.ArgumentParser();a.add_argument('--domain',required=True);args=a.parse_args()
if (p/'.env').exists():raise SystemExit('.env existe : configuration conservée')
domain=args.domain
if not domain or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789.-' for c in domain):raise SystemExit('Domaine invalide')
(p/'.env').write_text('DOMAIN='+domain+'\n'+''.join(k+'='+secrets.token_hex(32)+'\n' for k in ['POSTGRES_PASSWORD','OIDC_SECRET','IDENTITY_DB_PASSWORD','IDENTITY_ADMIN_PASSWORD']))
c=json.loads((p/'config/element.json').read_text());c['default_server_config']['m.homeserver']={'base_url':'https://'+domain,'server_name':domain};(p/'config/element.json').write_text(json.dumps(c,indent=2))
print('Configuration créée, secrets non affichés.')
