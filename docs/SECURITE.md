# Sécurité — synthèse de concours

## Protections

Le client utilise le SDK Matrix et Rust crypto. Créations de salons forcées en privé, chiffrées, sans fédération, historique joined. Le module refuse les événements de contenu non chiffrés et les états non autorisés. Les fichiers sont chiffrés avant upload avec matrix-encrypt-attachment et déchiffrés uniquement dans le navigateur ; aucune miniature ni prévisualisation distante. Limite 10 Mo.

Le client bloque l’envoi vers les appareils non vérifiés. La vérification manuelle compare les clés Ed25519 par un canal indépendant, avec confirmation explicite. Une nouvelle clé exige une nouvelle vérification. Aucun repli en clair. Le serveur ne peut toutefois pas certifier qu’un client malveillant chiffre réellement des octets présentés comme ciphertext : les garanties concernent les parcours du client fourni et ses bibliothèques.

TOTP local obligatoire, inscription et invités fermés, aucun grant OAuth de mot de passe direct pour les clients. Code d’enrôlement de quinze minutes à usage unique, conservé haché ; première connexion avec nouveau mot de passe et TOTP. Récupération administrative contrôlée sans SMS/email. Console avec rôle serveur, authentification récente, cookies protégés, CSRF, validation des entrées et limitation des demandes.

Révocation combinant identité, jetons, appareils, gel persistant et migration de salons. Une déconnexion OIDC seule n’est pas suffisante. Échecs partiels visibles et reprise après réauthentification. Anciennes copies hors ligne potentiellement conservées.

## Métadonnées et stockage

Synapse voit identifiants, appareils, IP, heures, tailles, fréquences, appartenances et événements d’état. Keycloak voit identités et authentifications, et détient les secrets TOTP nécessaires à leur validation ; pas les clés des messages. L’administration voit annuaire, opérations, appareils et métadonnées des salons. Caddy termine TLS et voit les requêtes et leurs tailles. Ne pas mettre de contenu confidentiel dans les noms et sujets.

Clés IndexedDB sur l’appareil ; messages déchiffrés et brouillons en mémoire. Jetons dans sessionStorage, exposés à un XSS de même origine. CSP, textContent pour les contenus, aucun CDN, police distante ou analytique. Web Locks limite à un onglet cryptographique actif. Le service worker ne cache que les fichiers statiques listés, jamais une réponse Matrix, un annuaire ou un média.

Aucun journal d’accès ; erreurs HTTP sensibles exclues de Caddy. Rotation Docker bornée. Audit administratif limité à acteur/action/cible, rétention configurable de trente jours. Barrières et correspondances de salons conservées pour maintenir les contrôles d’accès.

## Limites

Un serveur web compromis peut distribuer un JavaScript qui vole les clés ; TLS ne résout pas cette menace. La distribution et les appareils doivent être protégés. La sauvegarde serveur ne récupère pas les clés des navigateurs : perdre toutes ces clés peut rendre l’historique illisible. Aucun effacement distant garanti, blocage universel des captures, antivirus du contenu chiffré, notification mobile universelle ou valeur juridique automatique des accusés. Audit et qualification multiappareils nécessaires avant toute donnée réelle.

## Analyse IA locale facultative

Le bouton Assistant IA local partage uniquement la demande saisie et les extraits explicitement cochés avec Ollama/Qwen sur cette machine. Ce traitement reçoit du texte déchiffré, en dehors du chiffrement Matrix. Il n’accède pas aux clés Matrix ni aux pièces jointes et ne publie aucun message. L’API exige l’identité Matrix, vérifie les salons sources et recontrôle les droits après génération. Le moteur n’a ni port publié ni accès Internet et ses logs Docker sont désactivés. Voir [IA_LOCALE.md](IA_LOCALE.md) pour les limites de mémoire, de conservation et d’injection de consignes.
