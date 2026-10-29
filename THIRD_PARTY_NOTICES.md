# Composants, licences et vérification

Les sources originales de ce projet sont AGPL-3.0-or-later. Les bibliothèques et images restent sous leurs licences amont. Aucun composant amont n’a été relicencié ; aucune modification de leur code source n’est revendiquée. Le client et la console sont originaux, les imports et configurations sont décrits dans le dépôt.

| Composant | Version fixée | Licence | Source officielle |
|---|---|---|---|
| Matrix JS SDK | 44.0.0 | Apache-2.0 | https://github.com/matrix-org/matrix-js-sdk |
| Rust crypto WASM | 18.9.0 | Apache-2.0 | https://github.com/matrix-org/matrix-rust-sdk-crypto-wasm |
| matrix-encrypt-attachment | 1.0.3 | Apache-2.0 | https://github.com/matrix-org/matrix-encrypt-attachment |
| Synapse | 1.161.0 | AGPL-3.0 | https://github.com/element-hq/synapse |
| Keycloak | 26.8.1 | Apache-2.0 | https://github.com/keycloak/keycloak |
| PostgreSQL | 17.11 Alpine | PostgreSQL License | https://www.postgresql.org/about/licence/ |
| Caddy | 2.10.2 Alpine | Apache-2.0 | https://github.com/caddyserver/caddy |
| Node | 22.22.3 Alpine | MIT et notices intégrées | https://nodejs.org/ |
| openid-client | 6.8.8 | MIT | https://github.com/panva/openid-client |
| jose | 6.2.13 | MIT | https://github.com/panva/jose |
| pg | 8.23.1 | MIT | https://github.com/brianc/node-postgres |
| loglevel | 1.9.2 | MIT | https://github.com/pimterry/loglevel |
| Vite | 7.3.7 | MIT | https://github.com/vitejs/vite |
| TypeScript | 5.9.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Prettier | 3.6.2 | MIT | https://github.com/prettier/prettier |
| Element Web, référence facultative non exposée | 1.12.32 | AGPL-3.0, option libre retenue | https://github.com/element-hq/element-web |
| PyOTP, recette uniquement | 2.9.0 | MIT | https://github.com/pyauth/pyotp |
| GnuPG, opération de sauvegarde | binaire local fourni avec Git, non redistribué | GPL, notices du binaire | https://gnupg.org/ |

Les lockfiles figent les dépendances transitives. Conserver leurs notices et celles des distributions de base. Lors d’une redistribution d’images, fournir les sources correspondantes et mentions selon leurs obligations ; ce fichier ne remplace pas leurs licences. GnuPG est appelé localement, pas incorporé au serveur de messagerie.

## Sources techniques consultées le 29 octobre 2026

- Installation/compatibilité Synapse : https://element-hq.github.io/synapse/latest/setup/installation.html
- Configuration, OIDC, médias authentifiés, limites : https://element-hq.github.io/synapse/latest/usage/configuration/config_documentation.html
- Déconnexion/désactivation/appareils : https://element-hq.github.io/synapse/latest/admin_api/user_admin_api.html
- Règles d’événements : https://element-hq.github.io/synapse/latest/modules/third_party_rules_callbacks.html
- Pièces jointes chiffrées standard : https://spec.matrix.org/latest/client-server-api/
- SDK et magasin cryptographique : https://matrix-org.github.io/matrix-js-sdk/
- TOTP obligatoire, distinct du flux conditionnel : https://www.keycloak.org/docs/latest/server_admin/index.html
- Import de realm et conteneurs : https://www.keycloak.org/server/containers
- Correctif PostgreSQL et migration mineure sans dump requis : https://www.postgresql.org/docs/17/release-17-11.html
- Node 22.22.3 : https://nodejs.org/en/blog/release/v22.22.3

Les tags Docker ont été téléchargés et les services exécutés. La compatibilité documentaire ne constitue pas un audit. L’AGPL des sources originales est compatible avec les bibliothèques Apache-2.0/MIT utilisées ; les services distincts conservent leurs licences.
