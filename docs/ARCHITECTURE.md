# Architecture finale

```mermaid
flowchart LR
 U[Client TypeScript PWA / SDK Matrix + Rust crypto] -->|HTTPS / payload chiffré| P[Caddy et PKI locale]
 P --> S[Synapse et module de politique]
 P --> I[Keycloak / TOTP]
 P --> A[Console et service administratif]
 S --> D[(PostgreSQL Matrix et politiques)]
 S --> M[(Médias chiffrés)]
 I --> K[(PostgreSQL identité)]
 A -->|Identités / sessions| I
 A -->|État des salons / administration| S
 A -->|Rôles / annuaire / opérations| D
 U --> L[(Clés locales IndexedDB)]
```

Le client principal est original et utilise le SDK officiel. Le profil Docker reference-client conserve Element comme référence non exposée. Aucun backend parallèle ne transporte les messages ; le service administratif ne reçoit aucun contenu de discussion ni clé de déchiffrement.

Console : Authorization Code + PKCE, state et nonce ; validation JWT par openid-client/jose, issuer, audience et rôle administrateur. Cookie Secure/HttpOnly/SameSite, Origin et CSRF, sessions en mémoire de dix minutes. Une mutation consomme une authentification récente de moins de deux minutes. Redémarrer la console termine ses sessions.

Le compte technique Matrix reste interne, sans appareil cryptographique. Des jetons administratifs temporaires d’un membre restant créent seulement l’état et les invitations des successeurs, puis sont déconnectés ; ils n’ont aucune clé E2EE. Aucune élévation des droits du compte technique dans les salons n’est utilisée.

Rôles applicatifs et annuaire sont dans PostgreSQL. Les agents créent des conversations à deux ; les responsables gèrent les groupes. Être administrateur ne confère pas de clés de contenu.

Seul Caddy publie des ports, liés par défaut à 127.0.0.1. Réseau serveur interne ; aucun port PostgreSQL, Keycloak ou Synapse publié. TLS par autorité interne Caddy, y compris pour les appels OIDC de retour. Aucun service de certificats externe indispensable.
## Extension IA locale

Le navigateur choisit les textes déjà déchiffrés à partager avec `/assistant/api/`. Le service d’administration vérifie le jeton Matrix, l’enrôlement et les droits sur le salon, puis appelle Ollama sur un réseau Docker interne distinct. Seul `qwen3.5:2b` est utilisé, sans outil ni accès Internet. Les agents sont des spécialisations de consignes : guide avec fiches locales pertinentes, rédaction, synthèse et actions. Le résultat retourne au navigateur et peut devenir un brouillon ; son envoi ultérieur suit le chiffrement et les vérifications Matrix habituels. Aucun bot détenteur des clés des salons n’est ajouté. Détails et limites : [IA_LOCALE.md](IA_LOCALE.md).
