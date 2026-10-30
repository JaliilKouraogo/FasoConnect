"""Installe uniquement Qwen local dans le volume Ollama isolé de FasoConnect."""
import hashlib, json, os, pathlib, re, shutil, subprocess
from paths import ROOT, compose

MODEL = 'qwen3.5:2b'
models = pathlib.Path(os.environ.get('OLLAMA_MODELS', pathlib.Path.home()/'.ollama/models'))
manifest = models/'manifests/registry.ollama.ai/library/qwen3.5/2b'
if not manifest.exists():
    if not shutil.which('ollama'):
        raise SystemExit('Installer Ollama depuis https://ollama.com/download puis relancer Configurer-IA.ps1.')
    print('Téléchargement initial de Qwen 3.5 2B. Aucune donnée de messagerie transmise.', flush=True)
    subprocess.run(['ollama', 'pull', MODEL], check=True)
if not manifest.exists():
    raise SystemExit('Modèle introuvable. Vérifier le dossier OLLAMA_MODELS.')

blobs = {}
def visit(value):
    if isinstance(value, dict):
        digest = value.get('digest')
        if digest:
            if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest): raise ValueError('Empreinte de modèle invalide')
            name = digest.replace(':', '-')
            if name not in blobs:
                file = models/'blobs'/name
                if not file.is_file(): raise ValueError('Un fichier du modèle est absent')
                with file.open('rb') as stream:
                    if hashlib.file_digest(stream, 'sha256').hexdigest() != digest.split(':')[1]:
                        raise ValueError('Un fichier du modèle est corrompu')
                blobs[name] = file
                if file.stat().st_size < 2_000_000:
                    try: nested = json.loads(file.read_bytes())
                    except (ValueError, UnicodeError): nested = None
                    if nested: visit(nested)
        for key, child in value.items():
            if key != 'digest': visit(child)
    elif isinstance(value, list):
        for child in value: visit(child)

visit(json.loads(manifest.read_bytes()))
print('Fichiers Qwen vérifiés. Préparation du service local isolé…', flush=True)
subprocess.run(compose()+['up','-d','ai'], cwd=ROOT, check=True)
subprocess.run(compose()+['exec','-T','ai','mkdir','-p','/root/.ollama/models/blobs','/root/.ollama/models/manifests/registry.ollama.ai/library/qwen3.5'], check=True)
for name, file in blobs.items():
    target = '/root/.ollama/models/blobs/'+name
    existing = subprocess.run(compose()+['exec','-T','ai','stat','-c','%s',target], capture_output=True, text=True)
    if existing.returncode == 0 and existing.stdout.strip() == str(file.stat().st_size): continue
    print('Copie locale d’un composant Qwen…', flush=True)
    subprocess.run(compose()+['cp',str(file),'ai:'+target], check=True)
subprocess.run(compose()+['cp',str(manifest),'ai:/root/.ollama/models/manifests/registry.ollama.ai/library/qwen3.5/2b'], check=True)
subprocess.run(compose()+['exec','-T','ai','ollama','show',MODEL], stdout=subprocess.DEVNULL, check=True)
print('Qwen 3.5 2B prêt dans Ollama. Aucun port IA exposé, aucun modèle cloud utilisé.', flush=True)
