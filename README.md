# FasoConnect — Hackathon 226, édition 2026

Messagerie administrative fictive pour le Burkina Faso. **Niveau : Créer** : client TypeScript et console originaux, sur Matrix et son chiffrement officiel. Prototype de concours, sans certification de sécurité.

## Démonstration locale

Ouvrir https://localhost/service/ ou https://localhost/admin/. Le projet est dans **FasoConnect sur le Bureau** ; raccourcis FasoConnect.url et Administration.url. Pour redémarrer, exécuter Demarrer.ps1.

Le Bureau est dans OneDrive : les secrets et accès fictifs restent dans `Documents/Codex/FasoConnect-prive`. local.settings.json indique ce dossier sans contenir de secret. L’autorité TLS locale a été approuvée dans le profil Windows avec votre accord.

## Installation vierge

```powershell
python scripts/configure.py --domain localhost
$cfg = Get-Content local.settings.json -Raw | ConvertFrom-Json
$env:COMPOSE_ENV_FILES = Join-Path $cfg.privateDirectory '.env'
docker compose up -d --build
python scripts/demo.py
```

La dernière commande crée volontairement les seuls comptes fictifs et impose changement du mot de passe et TOTP. Elle est séparée pour ne pas installer automatiquement des comptes de concours sur un hébergement réel. Ne jamais ignorer les alertes de certificat. Voir docs/DEPLOIEMENT.md.

## Fonctions

PWA française, annuaire authentifié, conversations privées et groupes sur invitation, texte, réponses, fichiers chiffrés de 10 Mo maximum, membres, vérification manuelle des appareils et instructions avec accusés chiffrés. Console avec rôle administrateur, réauthentification récente pour chaque action sensible, code d’activation de quinze minutes à usage unique et récupération contrôlée sans SMS/email.

La révocation coupe les identités et sessions, bloque durablement les anciens salons et crée des successeurs avec de nouvelles sessions de chiffrement. Les membres acceptent les invitations ; l’historique reste dans les anciens salons. Un appareil peut conserver ses anciennes copies.

## Preuves et limites

Tests réels : TOTP puis connexion Matrix, groupe chiffré, fichier, instruction et accusé, révocation sur deux appareils, appareil perdu, coupure sans doublon, recherche de témoins, sauvegarde chiffrée et restauration isolée des deux bases. Détails dans docs/VERIFICATION.md.

Aucun effacement distant garanti, blocage universel des captures, valeur juridique automatique ou notification mobile universelle. Les clés restent dans le navigateur ; pas de sauvegarde automatique de ces clés dans ce prototype. Qualification sur téléphones physiques et accessibilité exhaustive à compléter. Les brouillons hors ligne restent en mémoire et leur renvoi est manuel.

## Technologies et licences

Matrix JS SDK 44.0.0 / Rust crypto WASM 18.9.0, Synapse 1.161.0, Keycloak 26.8.1, PostgreSQL 17.11, Caddy 2.10.2 et Node 22.22.3. Sources originales AGPL-3.0-or-later ; licences amont conservées dans THIRD_PARTY_NOTICES.md. Aucun CDN, fournisseur d’identité, email, SMS ou analytique externe. Téléchargements à l’installation ; services et PKI entièrement locaux à l’exécution.
