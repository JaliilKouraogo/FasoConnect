# Vérification — 29 octobre 2026

## Complément du 30 octobre : IA locale et interface

### Correction des conversations et présentation de messagerie

- Création : sélection dans l’annuaire, exclusion du créateur, déduplication des destinataires et attente de la synchronisation de l’état chiffré avant d’ouvrir le salon. Les erreurs sont affichées dans la fenêtre de création. Une création déjà reconnue mais encore en synchronisation n’est pas répétée au clic suivant.
- Invitations : bouton direct dans la conversation, choix de contacts et confirmation d’envoi. Les invitations reçues sont regroupées, sans suppression des anciens salons. Les conversations privées en doublon sont rangées dans l’historique accessible.
- Quatre tests de régression sur les destinataires, les droits, la synchronisation et le classement sans perte des salons réussis. Recette SDK/HTTPS réelle : création, invitation initiale, acceptation et invitation dans un salon existant réussies. Les deux salons temporaires sont quittés par leurs participants après le test.
- Chrome : nouvelle liste de contacts observée, contact Gamma sélectionné depuis Beta et conversation existante ouverte avec son champ de message. Aucune saisie d’identifiant manuel requise et aucun message envoyé lors de ce contrôle. Contrôle visuel de bureau effectué ; qualification exhaustive sur téléphones toujours à compléter.
- Présentation simplifiée en deux colonnes, messages entrants/sortants, options secondaires regroupées, texte plus lisible et navigation mobile liste/conversation avec retour.

- Ollama 0.40.11 installé dans un service dédié ; Qwen 3.5 2B importé depuis le cache local après contrôle des empreintes. Aucun port publié ; unique réseau Docker interne ; fonctions cloud désactivées ; journalisation du moteur désactivée.
- Sept tests nouveaux sur l’IA et les extraits réussis, soit treize tests Node avec les tests précédents de révocation/instructions ; quatre contrôles statiques et compilation TypeScript/Vite réussis.
- API HTTPS réelle : connexion obligatoire, origine incorrecte refusée, accord requis pour les extraits, agent inconnu refusé, compte révoqué refusé et ancien salon figé refusé.
- Les quatre agents ont répondu avec le modèle réel : aide, rédaction, synthèse avec références et action avec responsable/échéance. Après ajustement des consignes, mesures locales observées : rédaction 4,6 s, synthèse 14,3 s, actions 6,3 s ; premier guide 60,9 s avec chargement. Les premiers essais ont aussi montré des refus injustifiés et des étapes inventées, corrigés par consignes ciblées et sélection de fiches d’aide. Ce test ne garantit pas l’exactitude de toutes les réponses.
- Nouveau thème Keycloak hérité de keycloak.v2 : ressources locales accessibles en HTTPS ; mot de passe accepté puis TOTP toujours obligatoire ; code TOTP réel de Gamma accepté. Test sans consommation d’un nouveau jeton Matrix.
- Interface : accueil unique avec bouton de connexion, indications sur les deux étapes, navigation allégée, assistant visible, boutons de fichiers plus simples, palette douce et adaptation responsive par CSS. Mise à jour proposée aussi sur l’accueil sans effacer les clés du navigateur.
- Le contrôle visuel automatisé dans Chrome a été interrompu car l’outil ne pouvait pas identifier l’URL avec assez de certitude. Aucun contournement de cette limite ; rendu complet et interactions sur téléphone à vérifier manuellement.


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

## Assistant personnel local — 1er novembre 2026

- Construction du client TypeScript/Vite et 32 tests JavaScript réussis, dont le contrôle du profil injecté côté serveur et des extraits soumis à accord.
- Service IA local accessible depuis le conteneur administratif ; `qwen3.5:2b` présent. La route publique `/assistant/api/status` sans session répond 401.
- Trois sessions d'agent historiques ont été refusées avec 401. Une session de responsable active a reçu le profil `responsable` et l'état « modèle prêt ».
- Une demande de rédaction entièrement fictive, sans extrait de conversation, a reçu HTTP 200 et une réponse du modèle en 17 secondes sur cette installation.
- Une demande avec extrait sans accord a reçu HTTP 400 ; le même extrait avec un salon non autorisé a reçu HTTP 403 avant toute inférence.
- Ces contrôles ne qualifient pas encore l'ergonomie du nouveau panneau dans un navigateur connecté, ni la qualité des réponses sur des dossiers réels.
