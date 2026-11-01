# Recette et démonstration

## Parcours de la version concours à qualifier

1. Connecter un responsable et deux agents fictifs dans des profils séparés ; créer un groupe, accepter les invitations et vérifier les appareils.
2. Responsable : Dossiers → Ouvrir un dossier, renseigner une référence et un titre fictifs. Agent : retrouver la carte du dossier et l'ouvrir.
3. Ajouter une note et un document au dossier ; vérifier leur réception et l'absence de contenu lisible en base et dans le stockage des médias.
4. Responsable : ajouter une instruction dans le dossier et choisir les exécutants. Agent : accuser réception, commencer le travail, ajouter un commentaire et soumettre. Responsable : demander une reprise motivée, puis valider la nouvelle soumission. Vérifier que l'autre agent conserve son propre état.
5. Préparer un texte, couper la connexion, tenter l'envoi puis revenir en ligne et réessayer explicitement. Vérifier l'absence de doublon et la conservation du brouillon au changement de conversation, sans rechargement.
6. Cliquer sur le micro dans le chat, enregistrer un vocal fictif, arrêter, préécouter puis envoyer. Vérifier aussi la suppression avant envoi. Le destinataire déchiffre et écoute. Le vocal ne constitue pas à lui seul une traduction ni une validation linguistique.
7. Révoquer un agent pendant le groupe ; contrôler ses deux appareils et les nouveaux échanges dans le successeur. Aucun brouillon de l'ancien salon ne doit être transféré automatiquement.

Les tests unitaires ne remplacent pas ce parcours navigateur. Vérifier aussi le microphone, le clavier et les petits écrans. L'interface reste française ; les traductions nationales ne sont pas encore validées. Les sections ci-dessous décrivent la recette historique, pas une preuve des nouvelles fonctions.

Uniquement les comptes fictifs. Les fixtures privées sont dans le dossier indiqué par local.settings.json, jamais dans Git ni sur le Bureau. Les tests d’intégration révoquent réellement les comptes/appareils fictifs ciblés. Préparer de nouveaux appareils SSO avant de rejouer un moteur cryptographique en mémoire : ne pas réutiliser un ancien device_id sans son magasin de clés.

## Vérifications courantes

```powershell
npm ci --prefix client
npm run --prefix client check
node --test admin/revocation.test.mjs tests/instructions.test.mjs
python scripts/check.py
python scripts/test_storage.py
```

Politique serveur : copier scripts/test_policy.py vers /tmp/test_policy.py dans Synapse puis exécuter `docker compose exec -T synapse python /tmp/test_policy.py`. Les commandes Docker emploient le .env privé via COMPOSE_ENV_FILES ou --env-file.

| Épreuve | Scénario et preuve |
|---|---|
| 1 Deux agents | test_sso_full.py : activation/TOTP ; e2e.mjs : message reçu/déchiffré avec SDK/Rust crypto |
| 2 Groupe/fichier | Trois participants, fichier chiffré, déchiffrement local identique |
| 3 Stockages | test_storage.py : témoins absents du dump, médias et logs ; complément au test cryptographique |
| 4 Transfert | e2e.mjs : octets média différents, retour aux octets d’origine par déchiffrement standard |
| 5 Non enrôlé | access-control.mjs : invités et mot de passe local refusés ; inscription Keycloak fermée |
| 6 Invitations | Adhésion sans invitation 403 ; groupe créé par un agent refusé |
| 7 TOTP | Connexions complètes avec TOTP ; mot de passe initial seul sans jeton ; code d’activation incorrect/réutilisé refusé |
| 8 Révocation / deux appareils | e2e.mjs : les deux jetons reçoivent 401 à sync et aux médias |
| 9 Nouvelles clés | Membres restants échangent dans le successeur ; les deux anciens moteurs ne déchiffrent pas l’événement obtenu hors bande |
| 10 Rôles | API anonyme 401 ; rôle responsable à la console 403 ; réauthentification exigée pour une mutation |
| 11 Innovation | Instruction/accusé chiffrés ; tests refusent imposteur, mauvais salon/référence, destinataires dupliqués |
| 12 Reconnexion | reconnection.mjs : coupure réelle du proxy, retry même transaction, même event_id |
| 13 Persistance | Arrêt/redémarrage de sauvegarde, mise à jour PostgreSQL, données conservées ; restauration isolée des deux bases |
| 14 Interface | Connexion, annuaire, invitation et refus avant vérification observés ; mobiles physiques/accessibilité exhaustive non qualifiés |

## Rejouer l’intégration

Le driver scripts/test_sso_full.py utilise le certificat public /trust/root.crt et PyOTP 2.9.0. Il active les seuls comptes fictifs et utilise de vrais codes TOTP, sans contournement. Les secrets de recette sont conservés localement et retirés des conteneurs en fin d’essai.

Les fixtures de sessions alimentent les scripts Node, avec NODE_EXTRA_CA_CERTS pointant vers local-ca.crt. L’administrateur doit être fraîchement authentifié avant e2e.mjs, lost-device.mjs, enrollment.mjs ou reauthorize.mjs. Alpha est révoqué à la fin d’e2e.mjs ; lost-device.mjs conserve le compte beta actif. enrollment.mjs vérifie le code unique de quinze minutes. access-control.mjs utilise la nouvelle identité. reconnection.mjs nécessite une nouvelle session de cet agent sur un appareil neuf.

Les scripts de test sont accompagnés de fixtures locales propres à cette machine ; ils ne constituent pas encore un lanceur universel de recette vierge. Synthèse sans secrets : PREUVES_RECETTE.json. Mesures locales, sans SLA : 591 ms agent, 1 149 ms appareil.

## Parcours manuel

Deux profils distincts : beta et gamma, TOTP, invitations puis comparaison des clés par un canal indépendant. Envoyer texte/fichier. Un nouvel appareil bloque les envois jusqu’à vérification. Gamma publie une instruction, beta confirme. Un troisième profil administrateur révoque un agent/appareil ; accepter les successeurs et constater les refus des anciens jetons. Les clés d’historique ne sont disponibles que si un appareil les a conservées ; les magasins éphémères des tests ne sont pas des sauvegardes.
