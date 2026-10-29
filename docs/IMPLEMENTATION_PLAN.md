# Plan et état réel
1. Adapter Element Web 1.12.32 (AGPL) et Synapse 1.161.0 (AGPL), PostgreSQL 17.6 et Caddy 2.10.2. Versions fixées, disponibilité des images à vérifier.
2. Déployer un socle HTTPS isolé, générer les secrets localement et conserver les volumes.
3. Valider OIDC avec Keycloak et TOTP obligatoire avant de créer des agents. Le socle ferme volontairement toutes les connexions tant que cette étape manque.
4. Ajouter contrôle serveur des événements chiffrés et politique des appareils vérifiés.
5. Implémenter une saga de révocation avec suivi des étapes, invalidation des sessions Matrix et renouvellement des sessions côté clients. Tester deux appareils et les courses.
6. Étendre le client pour instructions et accusés chiffrés, puis PWA et essais multiappareils.

Livraison actuelle : socle de déploiement, documentation et contrôle statique. Étapes 3 à 6 non réalisées. Ce socle ne satisfait pas encore le cahier des charges et ne doit pas recevoir de données réelles.
