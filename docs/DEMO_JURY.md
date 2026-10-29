# Recette et état des preuves
`python scripts/check.py` vérifie seulement quatre invariants de configuration ; il ne prouve ni chiffrement ni sécurité d'exécution.
`docker compose config --quiet` valide la structure après configuration de .env. `docker compose ps` et `docker compose logs` servent au diagnostic, à conserver sans secrets.

Toutes les épreuves fonctionnelles ci-dessous restent NON EXÉCUTÉES :
| Épreuve | Scénario reproductible après implémentation |
|---|---|
| 1 Communication | Enrôler alpha/beta, imposer TOTP, vérifier appareils, échanger un texte unique |
| 2 Groupe/fichier | Salon privé chiffré, inviter beta, envoyer fichier témoin et comparer son empreinte après déchiffrement |
| 3 Stockages | Chercher les témoins dans export DB, médias et logs ; compléter par inspection des événements et du client |
| 4 Transfert | Inspecter upload réseau : octets distincts du fichier, clé uniquement dans événement chiffré |
| 5 Enrôlement | Compte inconnu refusé ; inscription et invités refusés |
| 6 Invitations | Tenter join sans invitation : refus |
| 7 TOTP | Tester absence OTP, mauvais OTP, récupération, login direct Matrix et anciens jetons |
| 8 Révocation | Alpha sur deux appareils : révoquer ; anciens jetons sync et médias refusés |
| 9 Clés | Durant révocation envoyer en concurrence, renouveler tous les émetteurs ; alpha ne reçoit et ne déchiffre aucun message après barrière effective |
| 10 Rôles | Agent appelant administration : 403 ; réauthentification administrateur |
| 11 Instruction | Responsable publie, beta accuse ; imposture, doublon et non-destinataire refusés |
| 12 Reconnexion | Couper le réseau lors de l'envoi, reprendre : un seul événement logique |
| 13 Persistance | Redémarrer Compose et vérifier comptes, historique et déchiffrement |
| 14 Responsive | Parcours sur ordinateur et mobile réel, clavier et lecteur d'écran |

Révocation : mesurer t0 demande, t1 coupure authentification, t2 invalidation de tous jetons, t3 exclusions, t4 renouvellement confirmé par chaque émetteur. Ne déclarer effective qu'après la barrière définie et tests ; toute étape en échec reste visible et bloque la réussite. Ce protocole reste à implémenter.
