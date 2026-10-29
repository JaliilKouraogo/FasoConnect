# Rapport de vÃ©rification

29 octobre 2026 : quatre tests statiques rÃ©ussis ; `docker compose --env-file .env.example config --quiet` rÃ©ussit. Moteur Docker 29.1.3 accessible avec autorisation adaptÃ©e. TÃ©lÃ©chargement des images lancÃ©, pas de dÃ©marrage fonctionnel validÃ©.

Les quatorze tests d'acceptation restent non exÃ©cutÃ©s. Aucun Ã©change, aucun second facteur, aucune rÃ©vocation cryptographique ni instruction chiffrÃ©e n'est attestÃ©. Les connexions sont fermÃ©es par dÃ©faut. La licence AGPL officielle est incluse.

## Deuxième étape — résultats réellement observés
- Images téléchargées, PostgreSQL x2 et Synapse en bonne santé, Element, Keycloak et Caddy démarrés.
- Correction des permissions du volume Synapse et vérification de son démarrage.
- Realm Keycloak importé : lecture administrative des exécutions confirme auth-username-password-form REQUIRED et auth-otp-form REQUIRED. Pas de flux direct de mot de passe pour le client OIDC.
- API Matrix login : SSO, token de connexion SSO et application_service annoncés ; aucun m.login.password. Aucun application service configuré.
- Sept tests unitaires de la règle serveur passent dans le conteneur Synapse : refus du clair, type personnalisé clair, absence de chiffrement, salon public, état inconnu et changement d'algorithme ; autorisation du type chiffré attendu.
- HTTPS avec validation du certificat par l'autorité locale Caddy : HTTP 200 pour le client. Configuration Caddy valide.
- Aucun parcours utilisateur complet, aucun échange chiffré de deux agents et aucune révocation testés. Le TOTP configuré n'est pas encore une preuve d'absence de contournement.
- Le contrôle des événements ne peut pas prouver que des octets présentés comme ciphertext ont effectivement été chiffrés par un client honnête.
- Console Keycloak master et API admin refusées au proxy public ; administration technique uniquement depuis le réseau interne.

## Intégration SSO locale
Correction : les endpoints OIDC internes utilisent HTTPS, avec une autorité locale explicitement installée dans le magasin du conteneur ; aucune vérification de certificat désactivée. Seul son certificat public est partagé avec Synapse. Le démarrage attend la disponibilité du realm.
Test réel `scripts/test_activation.py` exécuté dans Synapse : parcours HTTPS vers Keycloak puis soumission du mot de passe temporaire de agent.alpha ; aucun jeton Matrix délivré, activation supplémentaire exigée. Cela ne couvre pas encore une connexion TOTP complète ou la récupération.
Quatre utilisateurs fictifs créés avec UPDATE_PASSWORD et CONFIGURE_TOTP, rôles Keycloak attribués. Ces rôles ne constituent pas encore une autorisation côté Matrix.
