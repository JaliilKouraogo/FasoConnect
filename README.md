# FasoConnect â€” Hackathon 226, Ã©dition 2026
Niveau visÃ© : **Ã‰tendre et adapter**. Socle technique incomplet, aucune certification de sÃ©curitÃ©.
Messagerie administrative souveraine reposant sur Element Web et Matrix Synapse. Le chiffrement des salons et piÃ¨ces jointes est fourni par le client amont ; il nâ€™est pas encore imposÃ© par ce projet.

## Installation
PrÃ©requis : Docker Compose, domaine DNS et ports 80/443 accessibles. Copier `.env.example` vers `.env`, dÃ©finir DOMAIN et un secret PostgreSQL alÃ©atoire (32 caractÃ¨res minimum). Exécuter `python scripts/configure.py --domain votre.domaine` pour générer les secrets et configurer le client (avant de créer .env). OIDC_SECRET, IDENTITY_DB_PASSWORD et IDENTITY_ADMIN_PASSWORD sont obligatoires.

```sh
docker compose up -d --build
docker compose ps
python scripts/check.py
```
Ouvrir `https://VOTRE_DOMAINE`. Caddy demande un certificat public avec validation normale. Les images sont tÃ©lÃ©chargÃ©es Ã  lâ€™installation. Le renouvellement ACME dÃ©pend Ã©galement dâ€™une autoritÃ© externe ; un dÃ©ploiement souverain doit fournir ses propres certificats et remplacer la configuration TLS. Aucun CDN nâ€™est configurÃ©.

## Ã‰tat et limites
Le socle sert le client et les API ; les connexions sont fermÃ©es volontairement : inscription, invitÃ©s et mots de passe dÃ©sactivÃ©s. Aucun compte de dÃ©monstration ne contourne le second facteur. Annuaire, rÃ´les institutionnels, console administrative, rÃ©vocation globale, contrÃ´le exclusif du chiffrement et innovation ne sont pas encore implÃ©mentÃ©s. Ne pas ouvrir les connexions pour une dÃ©monstration prÃ©sentÃ©e comme conforme.

Element apporte les conversations, fichiers et vÃ©rification dâ€™appareils ; ces parcours restent Ã  valider sur cette instance. La PWA, le mobile et les appels ne sont pas validÃ©s. Les donnÃ©es reÃ§ues par un appareil hors ligne restent potentiellement accessibles.

## Technologies et licences
Element Web et Synapse : AGPL-3.0, PostgreSQL : PostgreSQL License, Caddy : Apache-2.0. Les configurations originales sont sous AGPL-3.0-or-later. Voir THIRD_PARTY_NOTICES.md et docs/DEMO_JURY.md. Aucun secret rÃ©el ni compte fictif activÃ© nâ€™est distribuÃ©.

## Essai local vérifié
Le socle tourne sur https://localhost, avec HTTP sur 8088 car le port 80 était occupé. Le certificat provient de l’autorité locale Caddy : installer cette autorité dans un profil de test avant de naviguer, sans ignorer la validation TLS. La vérification HTTPS automatisée a utilisé explicitement cette autorité et obtenu HTTP 200. Aucun compte activé.
