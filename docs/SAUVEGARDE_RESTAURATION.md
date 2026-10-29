# Sauvegarde et restauration
Procédure à valider sur une instance jetable avant usage.
1. Arrêter proxy et synapse pour empêcher les écritures.
2. Exporter PostgreSQL : `docker compose exec -T db pg_dump -U synapse -d synapse -Fc > db.dump` (utiliser un shell qui préserve les octets binaires).
3. Sauvegarder le volume synapse en conservant permissions, médias, clé de signature et secrets ; sauvegarder .env hors du dépôt et les certificats Caddy. Chiffrer les archives avec un outil éprouvé, contrôler les accès.
4. Redémarrer les services.
Restaurer sur des volumes vides : recréer la base, utiliser pg_restore, restaurer intégralement le volume Synapse, remettre le même domaine et les secrets, puis démarrer et tester les clients. Une sauvegarde serveur ne remplace pas une sauvegarde des clés des clients.
