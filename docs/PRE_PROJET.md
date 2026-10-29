# Pré-projet — FasoConnect

FasoConnect propose une messagerie administrative souveraine pour le Hackathon 226, édition 2026, au Burkina Faso. Les seuls agents et contenus de la démonstration sont fictifs. Aucun service externe d’identité, SMS, email ou messagerie n’est indispensable.

## Architecture

Un client TypeScript PWA et une console originaux utilisent Matrix, Synapse, PostgreSQL, Keycloak et Caddy. Le SDK officiel et Rust crypto prennent en charge Olm/Megolm ; les pièces jointes suivent les mécanismes Matrix. Les clés de déchiffrement restent sur les appareils.

Enrôlement contrôlé, TOTP obligatoire, rôles agent/responsable/administrateur, salons privés et appareils vérifiés. La révocation coupe les accès, bloque les anciens salons et crée des successeurs pour les membres restants avec de nouvelles sessions de chiffrement. Les copies déjà reçues ne sont pas effaçables à distance.

## Innovation

Le responsable publie une instruction chiffrée : objet, contenu, priorité, échéance facultative et destinataires. Chaque destinataire confirme explicitement sa prise de connaissance par un événement chiffré. Le client vérifie le rôle, le salon, la référence et les destinataires et agrège les confirmations sans doublons logiques. Suivi opérationnel, sans prétention de preuve juridique.

## Engagement et résultats

Niveau **Créer** : client et console originaux sur des briques libres éprouvées. Sources originales AGPL-3.0-or-later ; notices et licences amont conservées. Aucun algorithme de chiffrement maison.

Prototype local exécutable avec Docker Compose. Chiffrement, fichier, TOTP, révocation sur deux appareils, appareil perdu, reconnexion sans doublon et restauration isolée ont été testés. Audit indépendant et qualification sur appareils mobiles restent nécessaires avant des données réelles.

## Équipe à compléter

- Intégration Matrix / exploitation : nom à compléter.
- Identité / contrôles d’accès : nom à compléter.
- Interface / accessibilité : nom à compléter.
- Recette / documentation / présentation : nom à compléter.
