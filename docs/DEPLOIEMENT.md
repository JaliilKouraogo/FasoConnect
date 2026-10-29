# Déploiement local et souverain

## Instance actuelle

Code : dossier FasoConnect du Bureau. Secrets et fixtures : `C:\Users\koura\Documents\Codex\FasoConnect-prive`, hors OneDrive. local.settings.json ne contient que ce chemin. Bases, médias et clés serveur sont dans les volumes Docker.

Exécuter Demarrer.ps1 puis ouvrir https://localhost/service/ ou https://localhost/admin/. HTTPS 443, HTTP de redirection 8088, écoute 127.0.0.1. L’autre application utilisant le port 80 n’a pas été interrompue. Aucun port serveur interne publié.

L’autorité Caddy a été approuvée dans le profil Windows avec accord explicite. Sur une autre machine, exporter `proxy:/data/caddy/pki/authorities/local/root.crt`, vérifier puis installer cette autorité dans le profil de test. Ne jamais distribuer sa clé privée ni ignorer une alerte TLS. Renouvellement local de la PKI, sans ACME public indispensable.

## Installation vierge

```powershell
python scripts/configure.py --domain localhost --private-dir "$env:USERPROFILE\Documents\Codex\FasoConnect-prive"
$cfg = Get-Content local.settings.json -Raw | ConvertFrom-Json
$env:COMPOSE_ENV_FILES = Join-Path $cfg.privateDirectory '.env'
docker compose up -d --build
python scripts/demo.py
```

Configuration idempotente : aucun secret remplacé, nom Matrix immuable. Ne pas changer un mot de passe PostgreSQL d’un volume existant dans .env sans migration de la base. Le profil facultatif reference-client contient Element non exposé ; le client principal est original. Appels audio/vidéo et édition des avatars hors périmètre de ce prototype.

## Comptes fictifs

Comptes initiaux : agent.alpha, agent.beta, responsable.gamma, admin.delta. La recette a configuré TOTP et changé les mots de passe. Le fichier privé .demo-activation.json contient `password` si présent, sinon `temporary_password`, et `totp_secret` pour importer le facteur dans une application locale. Ces secrets sont fictifs mais ne doivent pas être synchronisés ou committés.

Alpha est volontairement révoqué après la recette. Admin.delta peut le réautoriser après réauthentification ; nouveau mot de passe et nouveau TOTP sont imposés. Beta reste actif ; un appareil de recette a été révoqué. Les comptes agent.recette… proviennent des essais. Aucun compte de démonstration ne dispose de connexion Matrix par mot de passe.

Nouvel agent : la console remet un code et un mot de passe temporaire ; saisir le code sur https://localhost/activate sous quinze minutes, une fois. Puis changer le mot de passe et configurer TOTP. Aucun SMS/email.

## Plusieurs appareils et souveraineté

Choisir le nom définitif avant initialisation, un DNS interne et une adresse d’écoute adaptée ; distribuer l’autorité de confiance aux appareils autorisés. localhost désigne chaque appareil lui-même : cette instance locale ne permet pas une connexion directe depuis un téléphone distant. La PWA exige un contexte HTTPS de confiance et le support du navigateur.

Images et paquets sont téléchargés pendant installation/construction. Tous les services indispensables et la PKI sont locaux à l’exécution. Conserver un registre/cache local pour installer hors ligne. Sauvegarder les volumes avant mise à jour ; voir SAUVEGARDE_RESTAURATION.md.
