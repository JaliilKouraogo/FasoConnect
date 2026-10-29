"""Inspection de témoins fictifs ; complément aux essais cryptographiques."""
import pathlib,json,subprocess
from paths import ROOT,private_dir,compose
root=ROOT
proof=json.loads((private_dir()/'tests/.test-proof.json').read_text())
markers=[proof[k].encode() for k in ['marker','nextMarker','fileMarker']]+['Consigne fictive'.encode(),'Réunion fictive'.encode(),'temoin-fictif.txt'.encode()]
def run(args):
 r=subprocess.run(compose()+args,cwd=root,capture_output=True)
 if r.returncode:raise SystemExit('Commande d’inspection échouée ; aucun contenu affiché.')
 return r.stdout
for label,data in [('PostgreSQL',run(['exec','-T','db','pg_dump','-U','synapse','-d','synapse'])),('journaux serveur',run(['logs','--no-color']))]:
 assert not any(marker in data for marker in markers),'Témoin en clair détecté dans '+label
 print('PASS aucun témoin en clair dans',label)
script="import pathlib,sys,json; markers=json.load(sys.stdin); files=[p for p in pathlib.Path('/data/media_store').rglob('*') if p.is_file()]; hits=sum(any(bytes.fromhex(m) in p.read_bytes() for m in markers) for p in files); print('PASS stockage média inspecté' if not hits else 'FAIL média en clair');sys.exit(bool(hits))"
r=subprocess.run(compose()+['exec','-T','synapse','python','-c',script],cwd=root,input=json.dumps([m.hex() for m in markers]).encode(),capture_output=True)
assert r.returncode==0,'Inspection média échouée'
print(r.stdout.decode().strip())
print('Cette recherche complète les tests de transfert et de déchiffrement ; elle ne constitue pas seule une preuve de sécurité.')
