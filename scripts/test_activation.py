"""Test SSO réel via HTTPS validé ; s'arrête devant l'activation TOTP."""
import urllib.request,urllib.parse,ssl,http.client,socket,http.cookiejar,json,html.parser
class Form(html.parser.HTMLParser):
 def __init__(self):super().__init__();self.action=None;self.fields={}
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='form' and a.get('id')=='kc-form-login':self.action=a.get('action')
  if tag=='input' and a.get('type')=='hidden' and a.get('name'):self.fields[a['name']]=a.get('value','')
class Connection(http.client.HTTPSConnection):
 def connect(self):
  if self.host!='localhost':raise ValueError('Domaine de test inattendu')
  self.sock=self._context.wrap_socket(socket.create_connection(('proxy',443)),server_hostname='localhost')
class Handler(urllib.request.HTTPSHandler):
 def https_open(self,req):return self.do_open(Connection,req,context=ssl.create_default_context(cafile='/tmp/local-ca.crt'))
opener=urllib.request.build_opener(Handler(),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
url='https://localhost/_matrix/client/v3/login/sso/redirect/oidc-keycloak?'+urllib.parse.urlencode({'redirectUrl':'https://localhost/'})
r=opener.open(url,timeout=20);page=r.read().decode();form=Form();form.feed(page)
assert form.action,'Formulaire de connexion non trouvé'
creds=json.load(open('/tmp/demo-activation.json'))['agent.alpha']
fields=form.fields|{'username':'agent.alpha','password':creds['temporary_password']}
r=opener.open(form.action,urllib.parse.urlencode(fields).encode(),timeout=20);page=r.read().decode()
assert 'loginToken=' not in r.url,'Jeton Matrix obtenu avant activation : échec'
assert any(x in page for x in ['password-new','totp','otp','UPDATE_PASSWORD']),'Étape activation non reconnue'
print('PASS : SSO HTTPS atteint Keycloak ; mot de passe initial ne délivre aucun jeton Matrix et exige une activation supplémentaire.')
