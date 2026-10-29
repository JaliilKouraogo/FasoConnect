# Composants
Images amont non modifiées ; seuls les fichiers de configuration sont originaux.
| Composant | Version fixée | Licence | Source |
|---|---|---|---|
| Element Web | 1.12.32 | AGPL-3.0 (option retenue) | https://github.com/element-hq/element-web |
| Synapse | 1.161.0 | AGPL-3.0 | https://github.com/element-hq/synapse |
| PostgreSQL | 17.6 Alpine | PostgreSQL License | https://www.postgresql.org/about/licence/ |
| Caddy | 2.10.2 Alpine | Apache-2.0 | https://github.com/caddyserver/caddy |
Leurs dépendances et distributions de base conservent leurs notices respectives. Lors d'une redistribution d'images, conserver ces notices et fournir le code source correspondant selon les obligations applicables. Keycloak n'est pas encore intégré.

## Vérification documentaire du 29 octobre 2026
- https://github.com/element-hq/element-web/releases : version 1.12.32 publiée ; vérifier les correctifs de sécurité avant exposition.
- https://element-hq.github.io/synapse/latest/setup/installation.html : PostgreSQL et HTTPS recommandés.
- https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html : paramètres d'inscription, invités, OIDC, fédération.
- https://spec.matrix.org/latest/client-server-api/ : événements chiffrés et pièces jointes chiffrées côté client ; les clés de fichiers circulent dans le contenu chiffré.
- https://www.keycloak.org/docs/latest/server_admin/index.html : OTP conditionnel ne signifie pas OTP obligatoire. Exiger et tester un flux sans contournement avant intégration.
La compatibilité documentaire ne remplace pas un test d'intégration. Les tags Docker et leurs licences embarquées doivent encore être inspectés après téléchargement.
