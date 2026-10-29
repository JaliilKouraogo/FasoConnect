# FasoConnect — Hackathon 226, édition 2026
Niveau visé : **Étendre et adapter**. Socle technique incomplet, aucune certification de sécurité.
Messagerie administrative souveraine reposant sur Element Web et Matrix Synapse. Le chiffrement des salons et pièces jointes est fourni par le client amont ; il n’est pas encore imposé par ce projet.

## Installation
Prérequis : Docker Compose, domaine DNS et ports 80/443 accessibles. Copier `.env.example` vers `.env`, définir DOMAIN et un secret PostgreSQL aléatoire (32 caractères minimum). Ex�cuter `python scripts/configure.py --domain votre.domaine` pour g�n�rer les secrets et configurer le client (avant de cr�er .env). OIDC_SECRET, IDENTITY_DB_PASSWORD et IDENTITY_ADMIN_PASSWORD sont obligatoires.

```sh
docker compose up -d --build
docker compose ps
python scripts/check.py
```
Ouvrir `https://VOTRE_DOMAINE`. Caddy demande un certificat public avec validation normale. Les images sont téléchargées à l’installation. Le renouvellement ACME dépend également d’une autorité externe ; un déploiement souverain doit fournir ses propres certificats et remplacer la configuration TLS. Aucun CDN n’est configuré.

## État et limites
Le socle sert le client et les API ; les connexions sont fermées volontairement : inscription, invités et mots de passe désactivés. Aucun compte de démonstration ne contourne le second facteur. Annuaire, rôles institutionnels, console administrative, révocation globale, contrôle exclusif du chiffrement et innovation ne sont pas encore implémentés. Ne pas ouvrir les connexions pour une démonstration présentée comme conforme.

Element apporte les conversations, fichiers et vérification d’appareils ; ces parcours restent à valider sur cette instance. La PWA, le mobile et les appels ne sont pas validés. Les données reçues par un appareil hors ligne restent potentiellement accessibles.

## Technologies et licences
Element Web et Synapse : AGPL-3.0, PostgreSQL : PostgreSQL License, Caddy : Apache-2.0. Les configurations originales sont sous AGPL-3.0-or-later. Voir THIRD_PARTY_NOTICES.md et docs/DEMO_JURY.md. Aucun secret réel ni compte fictif activé n’est distribué.

## Essai local v�rifi�
Le socle tourne sur https://localhost, avec HTTP sur 8088 car le port 80 �tait occup�. Le certificat provient de l�autorit� locale Caddy : installer cette autorit� dans un profil de test avant de naviguer, sans ignorer la validation TLS. La v�rification HTTPS automatis�e a utilis� explicitement cette autorit� et obtenu HTTP 200. Aucun compte activ�.
