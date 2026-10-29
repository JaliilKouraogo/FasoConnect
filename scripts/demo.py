"""Enrôle seulement des identités fictives via l'administration interne Keycloak."""
import json,secrets,subprocess,pathlib
from paths import ROOT,private_dir,compose
def run(args,data=None):
 r=subprocess.run(compose()+['exec','-T','identity']+args,input=data,text=True,capture_output=True,cwd=ROOT)
 if r.returncode:raise SystemExit('Échec administration identité : consulter localement son état ; aucun secret affiché.')
 return r.stdout
run(['sh','-c','/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null'])
existing=json.loads(run(['/opt/keycloak/bin/kcadm.sh','get','users','-r','fasoconnect','--fields','username']))
names={u['username'] for u in existing}
path=private_dir()/'.demo-activation.json'
activation=json.loads(path.read_text()) if path.exists() else {}
for name,role in [('agent.alpha','agent'),('agent.beta','agent'),('responsable.gamma','responsable'),('admin.delta','administrateur')]:
 if name in names:continue
 password=secrets.token_urlsafe(24)
 user={'username':name,'enabled':True,'firstName':name,'lastName':'Simulation','requiredActions':['UPDATE_PASSWORD','CONFIGURE_TOTP'],'credentials':[{'type':'password','value':password,'temporary':True}],'attributes':{'ministere':['Ministère fictif de la Simulation'],'direction':['Direction fictive']}}
 run(['/opt/keycloak/bin/kcadm.sh','create','users','-r','fasoconnect','-f','-'],json.dumps(user))
 run(['/opt/keycloak/bin/kcadm.sh','add-roles','-r','fasoconnect','--uusername',name,'--rolename',role])
 activation[name]={'temporary_password':password,'role':role}
 path.write_text(json.dumps(activation,indent=2))
print('Identités fictives créées ou conservées. Secrets locaux : .demo-activation.json ; ne pas partager ce fichier. TOTP obligatoire à l’activation.')

result=subprocess.run(compose()+['run','--rm','--no-deps','init'],capture_output=True,cwd=ROOT)
if result.returncode:raise SystemExit('Comptes conservés ; synchronisation des rôles à vérifier.')
