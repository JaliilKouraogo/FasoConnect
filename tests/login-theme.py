"""Recette HTTPS du thème et du flux TOTP existant, sur un compte fictif uniquement."""
import base64, hashlib, hmac, html.parser, json, pathlib, re, ssl, struct, sys, time
import http.cookiejar, urllib.parse, urllib.request
root = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root/'scripts'))
from paths import private_dir

class Form(html.parser.HTMLParser):
    def __init__(self): super().__init__(); self.action=None; self.fields={}
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag == 'form' and not self.action: self.action=a.get('action')
        if tag == 'input' and a.get('type') == 'hidden' and a.get('name'): self.fields[a['name']]=a.get('value','')

secrets = json.loads((private_dir()/'.demo-activation.json').read_text(encoding='utf-8-sig'))['responsable.gamma']
context = ssl.create_default_context(cafile=str(root/'local-ca.crt'))
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=context), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
start='https://localhost/_matrix/client/v3/login/sso/redirect/oidc-keycloak?'+urllib.parse.urlencode({'redirectUrl':'https://localhost/service/'})
response=opener.open(start, timeout=25); page=response.read().decode()
assert 'Votre identifiant' in page and 'Votre espace vous attend.' in page, 'Theme personnalise absent'
for pattern in [r'href="([^"]*css/fasoconnect.css[^"]*)"', r'src="([^"]*js/fasoconnect.js[^"]*)"']:
    match=re.search(pattern,page); assert match, 'Ressource de theme absente'
    resource=opener.open(urllib.parse.urljoin(response.url,match.group(1)),timeout=15)
    assert resource.status == 200
print('PASS theme de connexion et ressources locales HTTPS')
form=Form(); form.feed(page)
form.fields.update(username='responsable.gamma',password=secrets.get('password',secrets['temporary_password']))
response=opener.open(urllib.parse.urljoin(response.url,form.action),urllib.parse.urlencode(form.fields).encode(),timeout=25)
page=response.read().decode()
assert 'name="otp"' in page and 'Code à 6 chiffres' in page, 'Etape code telephone absente'
print('PASS mot de passe accepte ; etape code du telephone toujours obligatoire')
form=Form(); form.feed(page)
secret=secrets['totp_secret']; raw=base64.b32decode(secret+'='*((8-len(secret)%8)%8))
digest=hmac.new(raw,struct.pack('>Q',int(time.time())//30),hashlib.sha1).digest()
offset=digest[-1]&15; code=(struct.unpack('>I',digest[offset:offset+4])[0]&0x7fffffff)%1000000
form.fields['otp']=f'{code:06d}'
response=opener.open(urllib.parse.urljoin(response.url,form.action),urllib.parse.urlencode(form.fields).encode(),timeout=25)
page=response.read().decode()
assert 'loginToken' in response.url or 'loginToken' in page, 'Connexion TOTP non terminee'
print('PASS code TOTP reel accepte avec le nouveau theme ; aucun nouveau jeton Matrix consomme')
