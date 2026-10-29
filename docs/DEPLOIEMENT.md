# Déploiement
Suivre README.md. Le nom Matrix est immuable ; l'initialisation refuse son changement. Les secrets sont générés dans le volume Synapse, les paramètres sont régénérés à chaque lancement. Ne pas changer le mot de passe PostgreSQL dans .env sans migration de la base.
Les certificats publics nécessitent DNS, réseau et ACME. Pour un réseau isolé, monter un certificat et sa clé dans Caddy et configurer `tls /certs/fullchain.pem /certs/key.pem` ; installer l'autorité sur chaque appareil. Ne jamais désactiver la vérification TLS.
Le réseau interne empêche la sortie de Synapse ; aucun port 8448 n'est publié. Le proxy refuse les routes de fédération et d'administration. Vérifier ces refus depuis un autre appareil.
Aucun compte de démonstration activé. Identités réservées pour les futurs essais : agent.alpha, agent.beta, responsable.gamma, admin.delta, ministère fictif de la Simulation. Aucun mot de passe distribué. L'activation locale et les invitations temporaires restent à développer après TOTP obligatoire.

## Configuration locale actuelle
https://localhost sert Element. HTTP redirige depuis le port 8088. Le certificat public de l'autorité locale peut être exporté :
`docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt local-ca.crt`
Importer cette autorité dans le magasin de confiance du profil de test avant d'utiliser le navigateur. Ne pas ignorer une alerte de certificat. Ne jamais exporter ni partager la clé privée de l'autorité.
`python scripts/demo.py` crée les quatre identités fictives de manière idempotente. Le fichier local .demo-activation.json contient les mots de passe temporaires ; exclu de Git. À la première connexion, changer le mot de passe et configurer TOTP avec une application locale compatible. Aucun SMS ou email requis. Les secrets de démonstration ne sont pas des invitations avec expiration : cette exigence reste à implémenter.
Les rôles attribués dans Keycloak ne sont pas encore propagés à une console administrative applicative.
