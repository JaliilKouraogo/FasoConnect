import os, pathlib, secrets, json
import yaml
root = pathlib.Path('/data')
domain = os.environ['DOMAIN']
password = os.environ['POSTGRES_PASSWORD']
if domain.endswith('.example.org') or password.startswith('REPLACE') or len(password) < 32:
    raise SystemExit('Configurer un domaine rÃ©el et un secret local de 32 caractÃ¨res minimum')
marker = root / 'server-name'
if marker.exists() and marker.read_text() != domain:
    raise SystemExit('Le nom Matrix est immuable : restaurer le domaine initial')
marker.write_text(domain)
secret_path = root / 'macaroon.secret'
if not secret_path.exists():
    secret_path.write_text(secrets.token_urlsafe(48))
    secret_path.chmod(0o600)
config = {
 'server_name': domain, 'public_baseurl': 'https://' + domain + '/',
 'pid_file': '/data/homeserver.pid', 'report_stats': False,
 'listeners': [{'port':8008,'tls':False,'type':'http','x_forwarded':True,
                'resources':[{'names':['client'],'compress':False}]}],
 'database': {'name':'psycopg2','args':{'user':'synapse','password':password,'database':'synapse','host':'db','cp_min':5,'cp_max':10}},
 'media_store_path':'/data/media_store', 'signing_key_path':'/data/signing.key',
 'macaroon_secret_key':secret_path.read_text(),
 'enable_registration':False,'allow_guest_access':False,
 'password_config':{'enabled':False},
 'modules':[{'module':'policy.EncryptedOnly','config':{}}],
 'oidc_providers':[{'idp_id':'keycloak','idp_name':'FasoConnect — TOTP',
 'issuer':'https://' + domain + '/auth/realms/fasoconnect',
 'discover':False,'authorization_endpoint':'https://' + domain + '/auth/realms/fasoconnect/protocol/openid-connect/auth',
 'token_endpoint':'http://identity:8080/auth/realms/fasoconnect/protocol/openid-connect/token',
 'jwks_uri':'http://identity:8080/auth/realms/fasoconnect/protocol/openid-connect/certs',
 'userinfo_endpoint':'http://identity:8080/auth/realms/fasoconnect/protocol/openid-connect/userinfo',
 'client_id':'synapse','client_secret':os.environ['OIDC_SECRET'],
 'scopes':['openid','profile'], 'user_mapping_provider':{'config':{'localpart_template':'{{ user.preferred_username }}','display_name_template':'{{ user.name }}'}}}],
 'federation_domain_whitelist':[], 'trusted_key_servers':[],
 'suppress_key_server_warning':True,
 'url_preview_enabled':False,'max_upload_size':'10M',
 'enable_metrics':False, 'log_config':'/data/log.yaml',
}
(root / 'homeserver.yaml').write_text(yaml.safe_dump(config))
(root / 'homeserver.yaml').chmod(0o600)
(root / 'log.yaml').write_text(yaml.safe_dump({'version':1,'handlers':{'null':{'class':'logging.NullHandler'}},'root':{'handlers':['null'],'level':'WARNING'},'disable_existing_loggers':True}))

for item in root.iterdir():
    os.chown(item, 991, 991)
os.chown(root, 991, 991)
