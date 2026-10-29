import time, urllib.request
for attempt in range(120):
    try:
        urllib.request.urlopen('http://identity:8080/auth/realms/fasoconnect',timeout=2).close()
        break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit('Identity realm not ready')
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
# Idempotent Keycloak client and service-account provisioning, also on existing realms.
def kc_request(method,path,data=None,token=None):
    payload=None if data is None else json.dumps(data).encode()
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    request=urllib.request.Request('http://identity:8080/auth'+path,payload,headers,method=method)
    with urllib.request.urlopen(request,timeout=20) as response:
        raw=response.read()
        return json.loads(raw) if raw else None
from urllib.parse import urlencode
payload=urlencode({'grant_type':'password','client_id':'admin-cli','username':'bootstrap-admin','password':os.environ['IDENTITY_ADMIN_PASSWORD']}).encode()
request=urllib.request.Request('http://identity:8080/auth/realms/master/protocol/openid-connect/token',payload)
with urllib.request.urlopen(request,timeout=20) as response:kc_admin=json.load(response)['access_token']
realm_template=pathlib.Path('/bootstrap/realm.json').read_text()
for key in ['DOMAIN','ADMIN_OIDC_SECRET','PROVISIONER_SECRET','OIDC_SECRET']:
    realm_template=realm_template.replace('${'+key+'}',os.environ[key])
realm=json.loads(realm_template)
base='/admin/realms/fasoconnect'
kc_request('PUT',base,{'internationalizationEnabled':True,'supportedLocales':['fr'],'defaultLocale':'fr'},kc_admin)
for client in realm['clients']:
    found=kc_request('GET',base+'/clients?clientId='+client['clientId'],token=kc_admin)
    if found:
        kc_request('PUT',base+'/clients/'+found[0]['id'],client,kc_admin)
    else:kc_request('POST',base+'/clients',client,kc_admin)
provisioner=kc_request('GET',base+'/clients?clientId=faso-provisioner',token=kc_admin)[0]
service_user=kc_request('GET',base+'/clients/'+provisioner['id']+'/service-account-user',token=kc_admin)
management=kc_request('GET',base+'/clients?clientId=realm-management',token=kc_admin)[0]
roles=[kc_request('GET',base+'/clients/'+management['id']+'/roles/'+name,token=kc_admin) for name in ['manage-users','view-users','query-users']]
kc_request('POST',base+'/users/'+service_user['id']+'/role-mappings/clients/'+management['id'],roles,kc_admin)
import psycopg2
with psycopg2.connect(host='db',user='synapse',password=password,dbname='synapse') as connection:
    with connection.cursor() as cursor:
        cursor.execute('CREATE TABLE IF NOT EXISTS faso_frozen_rooms(room_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL)')
        cursor.execute('CREATE TABLE IF NOT EXISTS faso_revocations(id TEXT PRIMARY KEY,data JSONB NOT NULL)')
        cursor.execute('CREATE TABLE IF NOT EXISTS faso_activations(username TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at BIGINT NOT NULL,used BOOLEAN NOT NULL)')
        cursor.execute('CREATE TABLE IF NOT EXISTS faso_audit(id BIGSERIAL PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())')
        cursor.execute('CREATE TABLE IF NOT EXISTS faso_agent_roles(user_id TEXT PRIMARY KEY,role TEXT NOT NULL)')
        cursor.execute('CREATE TABLE IF NOT EXISTS faso_directory(user_id TEXT PRIMARY KEY,name TEXT NOT NULL,ministere TEXT NOT NULL,direction TEXT NOT NULL,fonction TEXT NOT NULL)')
        users=kc_request('GET',base+'/users?max=200',token=kc_admin)
        for user in users:
            roles=kc_request('GET',base+'/users/'+user['id']+'/role-mappings/realm',token=kc_admin)
            names={role['name'] for role in roles}
            role=next((name for name in ['administrateur','responsable','agent'] if name in names),None)
            if role:cursor.execute('INSERT INTO faso_agent_roles(user_id,role) VALUES(%s,%s) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role',('@'+user['username']+':'+domain,role))
            if role:cursor.execute('INSERT INTO faso_directory(user_id,name,ministere,direction,fonction) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(user_id) DO NOTHING',('@'+user['username']+':'+domain,' '.join([user.get('firstName',''),user.get('lastName','')]),'Ministère fictif de la Simulation','Direction fictive','Agent fictif'))
auth_dir=pathlib.Path('/admin-auth')
auth_dir.mkdir(exist_ok=True)
registration=auth_dir/'registration.secret'
if not registration.exists():registration.write_text(secrets.token_hex(48))
os.chown(auth_dir,1000,1000)
os.chown(registration,1000,1000)
registration.chmod(0o600)
config = {
 'registration_shared_secret':registration.read_text(),
 'server_name': domain, 'public_baseurl': 'https://' + domain + '/',
 'pid_file': '/data/homeserver.pid', 'report_stats': False,
 'listeners': [{'port':8008,'tls':False,'type':'http','x_forwarded':True,
                'resources':[{'names':['client'],'compress':False}]}],
 'database': {'name':'psycopg2','args':{'user':'synapse','password':password,'database':'synapse','host':'db','cp_min':5,'cp_max':10}},
 'media_store_path':'/data/media_store', 'signing_key_path':'/data/signing.key',
 'macaroon_secret_key':secret_path.read_text(),
 'rc_login':{'address':{'per_second':0.05,'burst_count':10},'account':{'per_second':0.033,'burst_count':3},'failed_attempts':{'per_second':0.01,'burst_count':3}},
 'enable_registration':False,'allow_guest_access':False,
 'sso':{'client_whitelist':['https://'+domain+'/service/']},
 'password_config':{'enabled':False},
 'modules':[{'module':'policy.EncryptedOnly','config':{}}],
 'oidc_providers':[{'idp_id':'keycloak','idp_name':'FasoConnect — TOTP',
 'issuer':'https://' + domain + '/auth/realms/fasoconnect',
 'discover':False,'authorization_endpoint':'https://' + domain + '/auth/realms/fasoconnect/protocol/openid-connect/auth',
 'token_endpoint':'https://identity.localhost/auth/realms/fasoconnect/protocol/openid-connect/token',
 'jwks_uri':'https://identity.localhost/auth/realms/fasoconnect/protocol/openid-connect/certs',
 'userinfo_endpoint':'https://identity.localhost/auth/realms/fasoconnect/protocol/openid-connect/userinfo',
 'client_id':'synapse','client_secret':os.environ['OIDC_SECRET'],
 'scopes':['openid','profile'], 'user_mapping_provider':{'config':{'localpart_template':'{{ user.preferred_username }}','display_name_template':'{{ user.name }}'}}}],
 'federation_domain_whitelist':[], 'trusted_key_servers':[],
 'suppress_key_server_warning':True,
 'enable_authenticated_media':True,
 'url_preview_enabled':False,'max_upload_size':'10M',
 'enable_metrics':False, 'log_config':'/data/log.yaml',
}
(root / 'homeserver.yaml').write_text(yaml.safe_dump(config))
(root / 'homeserver.yaml').chmod(0o600)
(root / 'log.yaml').write_text(yaml.safe_dump({'version':1,'handlers':{'null':{'class':'logging.NullHandler'}},'root':{'handlers':['null'],'level':'WARNING'},'disable_existing_loggers':True}))

for item in root.iterdir():
    os.chown(item, 991, 991)
os.chown(root, 991, 991)
