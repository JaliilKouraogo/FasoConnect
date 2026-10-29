"""Test SSO réel via HTTPS validé ; s'arrête devant l'activation TOTP."""
import urllib.request,urllib.parse,ssl,http.client,socket,http.cookiejar,json,html.parser
class Form(html.parser.HTMLParser):
 def __init__(self):super().__init__();self.action=None;self.fields={}
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='form' and not self.action:self.action=a.get('action')
  if tag=='input' and (a.get('type')=='hidden' or a.get('name')=='selectedCredentialId') and a.get('name'):self.fields[a['name']]=a.get('value','')
class Connection(http.client.HTTPSConnection):
 def connect(self):
  if self.host!='localhost':raise ValueError('Domaine de test inattendu')
  self.sock=self._context.wrap_socket(socket.create_connection(('proxy',443)),server_hostname='localhost')
class Handler(urllib.request.HTTPSHandler):
 def https_open(self,req):return self.do_open(Connection,req,context=ssl.create_default_context(cafile='/trust/root.crt'))
import sys,secrets,time,os
sys.path.insert(0,'/tmp/pyotp.whl')
import pyotp
store='/tmp/demo-activation.json'
creds=json.load(open(store))
sessions={}
session_file=os.environ.get('TEST_SESSION_FILE','/tmp/test-sessions.json')
def save():
 with open(store,'w') as f:json.dump(creds,f)
import os
login_names=os.environ.get('TEST_LOGIN_NAMES','').split(',') if os.environ.get('TEST_LOGIN_NAMES') else (['admin.delta'] if os.environ.get('ADMIN_ONLY') else ['agent.alpha','agent.alpha','agent.beta','responsable.gamma','admin.delta'])
for username in login_names:
 opener=urllib.request.build_opener(Handler(),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 url=('https://localhost/admin/login' if (username=='admin.delta' or os.environ.get('TEST_ADMIN_DENIED')) else 'https://localhost/_matrix/client/v3/login/sso/redirect/oidc-keycloak?'+urllib.parse.urlencode({'redirectUrl':'https://localhost/'}))
 r=opener.open(url,timeout=20)
 for step in range(8):
  if (username=='admin.delta' or os.environ.get('TEST_ADMIN_DENIED')) and urllib.parse.urlparse(r.url).path=='/admin/':
   r=opener.open('https://localhost/admin/api/session');admin=json.load(r)
   admin['cookie']='; '.join(c.name+'='+c.value for h in opener.handlers if isinstance(h,urllib.request.HTTPCookieProcessor) for c in h.cookiejar)
   json.dump(admin,open('/tmp/test-admin.json','w'));print('PASS connexion console administrateur avec TOTP');break
  token=urllib.parse.parse_qs(urllib.parse.urlparse(r.url).query).get('loginToken')
  if token:
   body=json.dumps({'type':'m.login.token','token':token[0],'initial_device_display_name':'Test fictif '+username}).encode()
   response=opener.open(urllib.request.Request('https://localhost/_matrix/client/v3/login',body,{'Content-Type':'application/json'}))
   key=username if username not in sessions else username+'.second';sessions[key]=json.load(response);json.dump(sessions,open(session_file,'w'));print('PASS connexion SSO et TOTP :',username);break
  page=r.read().decode();form=Form();form.feed(page);data=form.fields.copy()
  import re,html
  continuation=re.search(r'href="([^"]*loginToken[^"]*)"',page)
  if continuation:
   r=opener.open(html.unescape(continuation.group(1)));continue
  import re
  print('Étape',step,'champs',re.findall(r'<input[^>]+name="([^"]+)"',page), 'erreurs',re.findall(r'id="input-error[^"]*"[^>]*>([^<]*)',page))
  if 'name="username"' in page or 'name="password"' in page:
   if step>0:raise RuntimeError('Connexion refusée ; arrêt pour éviter le verrouillage')
   data.update(username=username,password=creds[username].get('password',creds[username]['temporary_password']))
  elif 'totpSecret' in data:
   import base64
   secret=base64.b32encode(data['totpSecret'].encode()).decode();creds[username]['totp_secret']=secret;save()
   data.update(totp=pyotp.TOTP(secret).now(),userLabel='Test local fictif')
  elif 'password-new' in page:
   password=secrets.token_urlsafe(24);creds[username]['password']=password;save()
   data.update({'password-new':password,'password-confirm':password})
  elif 'name="otp"' in page:
   time.sleep(31 - time.time()%30)
   data['otp']=pyotp.TOTP(creds[username]['totp_secret']).now()
  elif 'name="totp"' in page:
   data['totp']=pyotp.TOTP(creds[username]['totp_secret']).now()
  elif 'name="email"' in page:
   data.update(email=username+'@example.invalid',firstName=username,lastName='Simulation')
  elif 'username' in data or 'displayName' in page:
   data.update(username=username,displayName=username)
  else:
   print('Étape supplémentaire :',username,'champs',list(data),'formulaire',bool(form.action),'titre',re.findall(r'<(?:title|h1)[^>]*>(.*?)</(?:title|h1)>',page,re.S))
   open('/tmp/sso-next.html','w').write(page)
   break
  if not form.action:print('Formulaire absent');break
  try:r=opener.open(urllib.parse.urljoin(r.url,form.action),urllib.parse.urlencode(data).encode(),timeout=20)
  except urllib.error.HTTPError as error:
   if os.environ.get('TEST_ADMIN_DENIED') and error.code==403:
    print('PASS rôle agent/responsable refusé à la console administrative');raise SystemExit(0)
   raise
 else:raise RuntimeError('Activation non terminée')
if not os.environ.get('ADMIN_ONLY'):json.dump(sessions,open(session_file,'w'))
assert os.environ.get('ADMIN_ONLY') or len(sessions)==sum(1 for name in login_names if name!='admin.delta'),'Toutes les connexions ne sont pas terminées'

