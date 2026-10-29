# Plan exécuté

1. Vérification des composants et licences : notices, versions fixées et sources officielles.
2. Docker et HTTPS : Synapse, Keycloak, deux PostgreSQL, Caddy et services construits et démarrés.
3. Chiffrement : SDK Matrix officiel / Rust crypto, groupe et fichier testés réellement.
4. Identités : connexion TOTP complète, rôles serveur, refus d’accès et code d’activation unique testés.
5. Révocation : gel des anciens salons, coupure des accès et successeurs chiffrés ; deux anciens appareils refusés et incapables de déchiffrer le nouvel événement. Appareil seul et reprise d’un échec partiel également testés.
6. Innovation : instruction et accusé chiffrés échangés ; cohérence des rôles et destinataires testée.
7. PWA : ressources locales, cache statique, mise à jour volontaire, vérification des appareils ; parcours navigateur observés.
8. Recette : coupure réelle sans doublon, recherche de témoins, sauvegarde chiffrée et restauration isolée des deux bases.
9. Livraison : projet sur le Bureau, lanceur et secrets hors OneDrive.

Choix final : client TypeScript original plutôt qu’un fork d’Element pour maîtriser les instructions et barrières d’envoi. Les bibliothèques cryptographiques restent celles de Matrix. Niveau Créer pour l’application originale, sans prétendre avoir créé le protocole ou la cryptographie.

Qualifications restantes : téléphones physiques, installation PWA par OS, accessibilité exhaustive, revue indépendante, concurrence/charge à grande échelle, ergonomie d’export/import chiffré des clés et démarrage d’un clone complet restauré. Ces points ne sont pas déclarés vérifiés.
