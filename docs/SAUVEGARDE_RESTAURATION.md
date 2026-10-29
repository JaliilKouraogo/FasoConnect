# Sauvegarde et restauration

scripts/backup.py emploie GnuPG, sans cryptographie originale. Installer GnuPG depuis sa source officielle ; le binaire fourni avec Git est disponible sur cette machine. Fichiers temporaires dans le dossier privé hors OneDrive, supprimés à la fin. Phrase secrète jamais affichée ni passée comme valeur d’argument.

```powershell
python scripts/backup.py create --archive "C:\chemin-prive\fasoconnect.gpg"
python scripts/backup.py verify --archive "C:\chemin-prive\fasoconnect.gpg"
```

La phrase est demandée dans le terminal ; la conserver séparément de l’archive. --passphrase-file accepte un fichier local protégé, pour la recette automatisée.

La création suspend les écritures, exporte les deux bases et les volumes Synapse, Caddy et authentification technique, inclut .env/configurations et chiffre avec GnuPG AES-256. Les services redémarrent dans un bloc de nettoyage, même après erreur. Une archive existante n’est pas écrasée.

La vérification déchiffre temporairement en privé, contrôle les empreintes et fichiers essentiels, restaure les deux dumps dans un PostgreSQL sans réseau et vérifie les données. Le conteneur et son volume de contrôle sont supprimés. Cette procédure a réussi. Les identités et événements persistent ; la console termine volontairement ses sessions lors d’un redémarrage.

Restauration opérationnelle : arrêter la cible, préparer des volumes vides, remettre les mêmes versions et nom Matrix, restaurer bases et volumes avec permissions, .env privé et certificats ; relancer l’initialisation puis vérifier les échanges depuis les appareils. Ne pas remplacer des volumes actifs ni lancer simultanément deux serveurs de même identité.

La recette restaure les bases isolées et vérifie les volumes archivés ; le démarrage d’un clone complet restauré reste à qualifier. Les clés IndexedDB des navigateurs ne sont pas dans cette sauvegarde. Perdre toutes les clés clients peut rendre l’historique irrécupérable.
