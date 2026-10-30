# FasoConnect — Messagerie administrative chiffrée

[![Licence : AGPL v3 ou ultérieure](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue)](LICENSE)

FasoConnect est un prototype de messagerie administrative pour le Hackathon 226, édition 2026. Il associe un client web français, une console d’administration et des services locaux Matrix, Keycloak et PostgreSQL.

Messagerie administrative fictive pour le Burkina Faso. **Niveau : Créer** : client TypeScript et console originaux, sur Matrix et son chiffrement officiel. Prototype de concours, sans certification de sécurité.

## Fonctionnalités

- Connexion avec mot de passe et code TOTP, enrôlement contrôlé et rôles agent, responsable et administrateur.
- Conversations privées, groupes sur invitation, annuaire et vérification des appareils.
- Messages et pièces jointes chiffrés de bout en bout avec les bibliothèques officielles Matrix.
- Instructions de service avec accusés de prise de connaissance chiffrés.
- Révocation d’un agent ou d’un appareil, blocage des anciens salons et création de conversations de remplacement.
- Application web installable, sauvegarde chiffrée et journal d’administration.
- Assistant Ollama / Qwen 3.5 2B local : guide, rédaction, synthèse et suivi des actions sur les seuls extraits sélectionnés.

## Installer une nouvelle instance locale

Prérequis : Git, Docker avec Docker Compose et Python 3. Les commandes suivantes utilisent PowerShell. Node.js est nécessaire uniquement pour développer et lancer les tests JavaScript hors des conteneurs ; GnuPG est requis pour les sauvegardes chiffrées.

```powershell
git clone https://github.com/JaliilKouraogo/FasoConnect.git
cd FasoConnect
python scripts/configure.py --domain localhost --private-dir "$env:USERPROFILE\Documents\Codex\FasoConnect-prive"
$cfg = Get-Content local.settings.json -Raw | ConvertFrom-Json
$env:COMPOSE_ENV_FILES = Join-Path $cfg.privateDirectory '.env'
docker compose --env-file $env:COMPOSE_ENV_FILES up -d --build
```

Le client est accessible sur https://localhost/service/ et l’administration sur https://localhost/admin/. L’instance écoute uniquement sur cet ordinateur : HTTPS 443 et redirection HTTP 8088. Docker télécharge les images et les paquets pendant l’installation.

Le navigateur doit faire confiance à l’autorité de certificat locale Caddy. Suivre le [guide de déploiement](docs/DEPLOIEMENT.md) pour exporter et approuver son certificat public sur la machine de test. Ne pas ignorer une alerte de certificat.

Pour créer volontairement les comptes fictifs de démonstration après le démarrage :

```powershell
python scripts/demo.py
```

Les accès sont générés dans le dossier privé. Aucun mot de passe ou secret TOTP n’est livré dans ce dépôt. La première connexion impose un changement de mot de passe et la configuration d’une application d’authentification. Ne pas utiliser les comptes fictifs pour des données réelles.

## Instance de démonstration déjà préparée

Pour installer l’IA locale, lancer `Configurer-IA.ps1`, puis cliquer **✦ Assistant IA** dans la messagerie. Voir le [guide des agents locaux](docs/IA_LOCALE.md) : installation, sélection des messages et confidentialité. Les brouillons ne sont jamais envoyés automatiquement.

Ouvrir https://localhost/service/ ou https://localhost/admin/. Le projet est dans **FasoConnect sur le Bureau** ; raccourcis FasoConnect.url et Administration.url. Pour redémarrer, exécuter Demarrer.ps1.

Le Bureau est dans OneDrive : les secrets et accès fictifs restent dans `Documents/Codex/FasoConnect-prive`. local.settings.json indique ce dossier sans contenir de secret. L’autorité TLS locale a été approuvée dans le profil Windows avec votre accord.

Les chemins et l’état des comptes décrits dans la documentation de recette concernent cette instance précise ; une nouvelle installation génère ses propres secrets et comptes.

## Documentation

Pour écrire à quelqu’un : **Nouveau message → choisir un collègue → Ouvrir la conversation**. Pour ajouter une personne à une conversation existante, utiliser **+ Inviter**. Les invitations reçues sont regroupées dans une boîte dédiée ; les anciens salons restent accessibles sous **Anciennes conversations**. Les groupes de plusieurs collègues sont créés par un responsable ou un administrateur.

| Sujet | Guide |
|---|---|
| Architecture et composants | [Architecture](docs/ARCHITECTURE.md) |
| Installation, comptes et HTTPS | [Déploiement](docs/DEPLOIEMENT.md) |
| Chiffrement et limites | [Sécurité](docs/SECURITE.md) |
| Révocation des accès | [Révocation](docs/REVOCATION.md) |
| Sauvegarde et restauration | [Sauvegarde](docs/SAUVEGARDE_RESTAURATION.md) |
| Scénarios de démonstration | [Démonstration](docs/DEMO_JURY.md) |
| Tests réellement effectués | [Vérification](docs/VERIFICATION.md) |
| Ollama, Qwen et agents IA locaux | [IA locale](docs/IA_LOCALE.md) |

## Vérifier le code

```powershell
npm ci --prefix client
npm run --prefix client check
node --test admin/revocation.test.mjs admin/assistant.test.mjs tests/instructions.test.mjs
python scripts/check.py
```

Les tests d’intégration nécessitent une instance locale et des comptes fictifs. Ils peuvent révoquer ces comptes ; lire le [guide de recette](docs/DEMO_JURY.md) avant de les lancer.

## Fonctions

PWA française, annuaire authentifié, conversations privées et groupes sur invitation, texte, réponses, fichiers chiffrés de 10 Mo maximum, membres, vérification manuelle des appareils et instructions avec accusés chiffrés. Console avec rôle administrateur, réauthentification récente pour chaque action sensible, code d’activation de quinze minutes à usage unique et récupération contrôlée sans SMS/email.

La révocation coupe les identités et sessions, bloque durablement les anciens salons et crée des successeurs avec de nouvelles sessions de chiffrement. Les membres acceptent les invitations ; l’historique reste dans les anciens salons. Un appareil peut conserver ses anciennes copies.

## Preuves et limites

Tests réels : TOTP puis connexion Matrix, groupe chiffré, fichier, instruction et accusé, révocation sur deux appareils, appareil perdu, coupure sans doublon, recherche de témoins, sauvegarde chiffrée et restauration isolée des deux bases. Détails dans docs/VERIFICATION.md.

Aucun effacement distant garanti, blocage universel des captures, valeur juridique automatique ou notification mobile universelle. Les clés restent dans le navigateur ; pas de sauvegarde automatique de ces clés dans ce prototype. Qualification sur téléphones physiques et accessibilité exhaustive à compléter. Les brouillons hors ligne restent en mémoire et leur renvoi est manuel.

## Technologies et licences

Matrix JS SDK 44.0.0 / Rust crypto WASM 18.9.0, Synapse 1.161.0, Keycloak 26.8.1, PostgreSQL 17.11, Caddy 2.10.2 et Node 22.22.3. Sources originales AGPL-3.0-or-later ; licences amont conservées dans THIRD_PARTY_NOTICES.md. Aucun CDN, fournisseur d’identité, email, SMS ou analytique externe. Téléchargements à l’installation ; services et PKI entièrement locaux à l’exécution.

Le texte complet de la licence du projet est dans [LICENSE](LICENSE). Les composants tiers conservent leurs propres licences ; leur inventaire et leurs sources sont dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Les images Docker et les dépendances ne sont pas redistribuées dans ce dépôt.

## Contribuer et signaler un problème

Décrire le scénario, le résultat attendu et le résultat observé dans une issue. Pour proposer une correction, ouvrir une pull request avec les vérifications effectuées. Ne jamais publier de mot de passe, code TOTP, jeton, clé privée, sauvegarde ou message réel dans une issue ou une capture d’écran.
