# FasoConnect — messagerie administrative souveraine

Prototype pour le sprint technique du Hackathon 226, édition 2026. Il permet à des agents fictifs de communiquer et de suivre le travail administratif, sur une infrastructure maîtrisée. Niveau d'engagement open source : **Créer**, avec un client et une console originaux reposant sur les bibliothèques Matrix officielles. Aucune cryptographie maison.

## Trois usages

- **Instructions de service** : exécutants choisis, priorité, échéance, prise de connaissance distincte de l'exécution, travail en cours, soumission, validation ou reprise motivée par l'auteur responsable.
- **Dossiers** : référence, titre, description, notes, documents et instructions regroupés dans une conversation. Les informations métier sont chiffrées ; les participants sont ceux de la conversation.
- **Connexion instable et vocal** : brouillons par conversation en mémoire, nouvelle tentative manuelle avec transaction stable et contrôle des droits ; un clic sur le micro du composeur démarre l'enregistrement, puis une barre intégrée permet d'arrêter, préécouter, supprimer ou envoyer le vocal chiffré. Deux minutes et 10 Mo maximum. L'interface reste française, sans traduction automatique.
- **Assistant de travail personnel** : aide locale à la rédaction, au résumé et au suivi des actions, avec propositions adaptées au rôle de l'utilisateur. Aucun message n'est lu automatiquement : les extraits sont choisis et autorisés pour chaque demande, puis la réponse reste un brouillon à vérifier.

## Architecture et sécurité

Le client TypeScript/Vite utilise Matrix JS SDK et Rust crypto pour Olm/Megolm. Synapse stocke les événements et fichiers chiffrés ; Keycloak assure l'enrôlement, le second facteur TOTP et les rôles. PostgreSQL, un service administratif Node.js et Caddy complètent l'instance Docker Compose. Aucun service tiers n'est indispensable à l'exécution ; images et dépendances sont téléchargées à l'installation.

Les salons sont privés, sur invitation, et les appareils doivent être vérifiés avant envoi. La révocation coupe les identités et jetons, fige les anciens salons et crée des conversations de remplacement. L'administration ne possède pas les clés des messages. L'assistant utilise un modèle local facultatif, sans port public ; son installation est décrite dans [IA locale](docs/IA_LOCALE.md).

## Installation locale Windows

Prérequis : Git, Docker Desktop démarré avec Docker Compose, Python 3 et PowerShell. Depuis le dépôt :

```powershell
./Installer-Local.ps1
```

Le script configure les secrets hors du dépôt, construit et démarre les services, crée les identités fictives et prépare la confiance HTTPS dans le profil Windows. Windows peut demander de confirmer l'ajout de l'autorité locale. Ne pas ignorer une alerte de certificat. Voir [Déploiement](docs/DEPLOIEMENT.md) pour les détails et autres environnements.

Messagerie : https://localhost/service/ ; administration : https://localhost/admin/. L'instance écoute sur cet ordinateur uniquement, ports HTTPS 443 et redirection HTTP 8088. `localhost` ne permet pas l'accès depuis un téléphone distant.

Comptes fictifs : `agent.alpha`, `agent.beta`, `responsable.gamma`, `admin.delta`. Leurs mots de passe temporaires sont dans `.demo-activation.json`, dans le dossier privé indiqué par `local.settings.json`. Première connexion : nouveau mot de passe et TOTP. Aucun secret n'est livré dans le dépôt. Utiliser deux profils de navigateur pour les essais ; vérifier les appareils avant d'échanger. Redémarrage : `./Demarrer.ps1`.

Pour une recette manuelle séparée des comptes historiques, lancer `python scripts/create_test_credentials.py`. Ce script crée `recette.responsable`, `recette.agent1`, `recette.agent2` et `recette.admin`, puis écrit leurs accès temporaires dans `identifiants-recette.md` dans le dossier privé. Il ne réinitialise aucun compte existant. Les deux agents et le responsable permettent de tester dossiers, instructions et vocaux ; l'administrateur sert aux essais de révocation.

## Vérifications

```powershell
npm ci --prefix client
npm run --prefix client build
node --test admin/*.test.mjs tests/*.test.mjs
python scripts/check.py
python -m unittest discover -s scripts -p test_policy.py
```

Les tests d'intégration exigent une instance et des comptes exclusivement fictifs. Certains révoquent leurs comptes : lire la [recette](docs/DEMO_JURY.md). Les preuves historiques décrivent une autre installation ; les nouvelles fonctions ne sont pas déclarées qualifiées sur téléphone sans recette réelle.

## Limites et sources

Le serveur voit les identités, appartenances, horaires, IP et tailles. Les clés restent dans le navigateur ; leur perte peut rendre l'historique illisible. Aucune suppression distante garantie des copies déjà reçues, valeur juridique automatique des accusés ou certification de sécurité. Historique chargé partiellement, changements de rôles, concurrence et sauvegarde des clés nécessitent une attention particulière. Pas encore de clôture des dossiers ou d'archivage légal. Audit indépendant, accessibilité et téléphones physiques restent à qualifier.

Sources originales sous [AGPL-3.0-or-later](LICENSE). Composants, versions, licences et liens : [inventaire tiers](THIRD_PARTY_NOTICES.md). Architecture et choix : [Architecture](docs/ARCHITECTURE.md) ; menaces et limites : [Sécurité](docs/SECURITE.md) ; périmètre et acceptation : [Vision produit](docs/VISION_PRODUIT.md). Consulter aussi [Révocation](docs/REVOCATION.md), [Sauvegarde](docs/SAUVEGARDE_RESTAURATION.md) et [Vérification](docs/VERIFICATION.md).

Contribuer par issue ou pull request avec scénario, résultat attendu et vérifications effectuées. Ne publier aucun secret, code TOTP, clé, sauvegarde ou contenu réel.
