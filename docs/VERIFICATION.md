# Vérification — 29 octobre 2026

## Résultats réellement obtenus

- Compose validé, services construits/démarrés ; PostgreSQL mis à jour en 17.11 et Node en 22.22.3 après vérification officielle et sauvegarde.
- Huit tests unitaires de politique Synapse, six de révocation/instructions et quatre contrôles statiques réussis ; vérification TypeScript réussie.
- Audit npm du client et de la console sans vulnérabilité signalée lors de la dernière installation. Ce n’est pas un audit complet de l’application ou des images.
- SSO OIDC et TOTP réels, activation des identités et connexion Matrix ; administrateur accepté, responsable refusé à la console.
- Message, instruction et accusé déchiffrés par leurs destinataires avec Rust crypto ; événements serveur m.room.encrypted.
- Fichier chiffré au transfert, déchiffrement identique ; tentative de texte clair refusée 403.
- Révocation d’alpha sur deux appareils : sync et médias 401 ; nouvel événement non déchiffrable sur les deux anciens moteurs. Mesure locale : 591 ms.
- Appareil beta seul : jeton refusé, compte maintenu actif ; 3 salons renouvelés en 1149 ms.
- Opération partielle reprise sans dégel ni nouvelle élévation du compte technique.
- Code d’enrôlement incorrect refusé, usage unique vérifié ; expiration de quinze minutes contrôlée par la requête serveur.
- Groupe sans invitation refusé, rôle agent limité, création forcée en privé/chiffré/historique joined ; invités et login local fermés ; fédération et API admin directe bloquées.
- Coupure réelle du proxy puis reprise : même transaction, même event_id, contenu chiffré conservé.
- Témoins absents du dump Matrix, médias et journaux ; complément aux essais cryptographiques.
- Sauvegarde GnuPG et restauration des deux bases dans un conteneur sans réseau réussies ; fichiers des volumes essentiels présents.

## Navigateur

HTTPS approuvé ; activation du navigateur ; connexion TOTP ; annuaire ; invitation ; refus d’envoi avant vérification d’un appareil. Proposition de mise à jour PWA volontaire observée. Une course de la première version lors de l’activation a été corrigée en attendant controllerchange avant rechargement.

## Limites des preuves

Identités et contenus exclusivement fictifs. Pas d’audit indépendant, SLA ou campagne exhaustive des courses réseau. Téléphones physiques, installation PWA par OS, accessibilité complète, ergonomie de récupération des clés et démarrage d’un clone complet restauré restent à qualifier. Le renvoi des brouillons hors ligne est manuel. La vérification mobile par navigateur a été interrompue par une indisponibilité de l’outil de contrôle ; elle n’est pas comptée comme preuve complète.

Première version fonctionnelle de concours, aucune certification absolue. Métadonnées, menace du serveur JavaScript compromis et copies hors ligne décrites dans SECURITE.md.
