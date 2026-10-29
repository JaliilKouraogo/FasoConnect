# Composants
Images amont non modifiÃ©es ; seuls les fichiers de configuration sont originaux.
| Composant | Version fixÃ©e | Licence | Source |
|---|---|---|---|
| Element Web | 1.12.32 | AGPL-3.0 (option retenue) | https://github.com/element-hq/element-web |
| Synapse | 1.161.0 | AGPL-3.0 | https://github.com/element-hq/synapse |
| PostgreSQL | 17.6 Alpine | PostgreSQL License | https://www.postgresql.org/about/licence/ |
| Caddy | 2.10.2 Alpine | Apache-2.0 | https://github.com/caddyserver/caddy |
Leurs dÃ©pendances et distributions de base conservent leurs notices respectives. Lors d'une redistribution d'images, conserver ces notices et fournir le code source correspondant selon les obligations applicables. Keycloak n'est pas encore intÃ©grÃ©.

## VÃ©rification documentaire du 29 octobre 2026
- https://github.com/element-hq/element-web/releases : version 1.12.32 publiÃ©e ; vÃ©rifier les correctifs de sÃ©curitÃ© avant exposition.
- https://element-hq.github.io/synapse/latest/setup/installation.html : PostgreSQL et HTTPS recommandÃ©s.
- https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html : paramÃ¨tres d'inscription, invitÃ©s, OIDC, fÃ©dÃ©ration.
- https://spec.matrix.org/latest/client-server-api/ : Ã©vÃ©nements chiffrÃ©s et piÃ¨ces jointes chiffrÃ©es cÃ´tÃ© client ; les clÃ©s de fichiers circulent dans le contenu chiffrÃ©.
- https://www.keycloak.org/docs/latest/server_admin/index.html : OTP conditionnel ne signifie pas OTP obligatoire. Exiger et tester un flux sans contournement avant intÃ©gration.
La compatibilitÃ© documentaire ne remplace pas un test d'intÃ©gration. Les tags Docker et leurs licences embarquÃ©es doivent encore Ãªtre inspectÃ©s aprÃ¨s tÃ©lÃ©chargement.

Keycloak 26.8.1, Apache-2.0, image amont non modifiée : https://github.com/keycloak/keycloak ; documentation : https://www.keycloak.org/server/containers .
