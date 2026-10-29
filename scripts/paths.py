import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def private_dir():
    settings=ROOT/'local.settings.json'
    return pathlib.Path(json.loads(settings.read_text(encoding='utf-8'))['privateDirectory']) if settings.exists() else ROOT
def compose():
    return ['docker','compose','--env-file',str(private_dir()/'.env'),'-f',str(ROOT/'compose.yaml')]
