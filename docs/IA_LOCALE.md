# Assistant et agents IA locaux

> Document historique. L'assistant n'est plus actif dans la version concours : les boutons sont retirés, l'API renvoie HTTP 410 sans traiter les extraits et Ollama n'est pas démarré par défaut. Installer le modèle ne réactive pas cette fonction. Les instructions suivantes concernent l'ancienne expérimentation et ne doivent pas être suivies pour tester la version concours.

FasoConnect utilise **Ollama 0.40.11 et Qwen 3.5 2B**. Le moteur est un service Docker dédié, sans port publié, sur un réseau Docker `internal: true` distinct de celui de Matrix. `OLLAMA_NO_CLOUD=1` désactive les fonctions cloud. Le modèle est fixé côté serveur ; le navigateur ne choisit ni une adresse de fournisseur ni un modèle distant.

## Installation

Prérequis : installation locale fonctionnelle, Docker, Python 3 et Ollama officiel sur le poste pour préparer les fichiers du modèle. Prévoir plusieurs Go de disque, et environ 16 Go de mémoire pour le poste avec Docker et les autres services. Aucun GPU n’est requis pour ce modèle ; les délais dépendent du matériel et de la taille des extraits.

Depuis le dossier du projet :

```powershell
.\Configurer-IA.ps1
```

Ou `python scripts/setup_ai.py`. Si le modèle est déjà présent dans le cache Ollama du poste, il est réutilisé. Sinon le script appelle `ollama pull qwen3.5:2b` pour le télécharger. L’image Docker est également téléchargée à la première installation. Cela ne transmet pas de contenu de messagerie.

Le script vérifie les empreintes des composants et ne copie que les fichiers du modèle choisi dans le volume `ai_models`. Il ne copie pas les identifiants Ollama du poste, ni les autres modèles, ni les comptes cloud. Les modèles ne sont pas versionnés dans Git. Le service peut ensuite fonctionner sans accès Internet.

Une installation sans modèle laisse la messagerie opérationnelle ; le panneau IA affiche les instructions de configuration. Le démarrage courant conserve le volume du modèle. Les sauvegardes serveur n’incluent pas ce cache de plusieurs Go : il se recrée avec le script d’installation.

## Utiliser les agents

Après connexion dans la messagerie, cliquer **✦ Assistant IA**.

| Agent | Usage |
|---|---|
| Guide FasoConnect | Expliquer TOTP, invitations, clés et fonctions de la messagerie |
| Rédiger un message | Préparer une réponse ou reformuler un texte |
| Résumer les extraits | Distinguer faits, décisions et questions ouvertes, avec références `[n]` |
| Repérer les actions et échéances | Relever les tâches, responsables et dates explicitement mentionnés |

Ce sont quatre agents spécialisés par leurs consignes, exécutés par le même modèle local. Ils n’ont aucun outil d’administration, accès web, planification autonome, accès aux fichiers ou capacité d’envoi de messages.

Écrire une demande. Pour une synthèse ou une analyse des actions, ouvrir une conversation, développer la sélection des extraits, cocher les messages voulus puis autoriser leur analyse locale. La sélection est vide par défaut. Seuls les derniers messages déjà chargés et déchiffrés sont proposés, au maximum 30 extraits, 1 600 caractères chacun et 12 000 au total. Les pièces jointes ne sont pas lues.

La réponse est affichée comme du texte, jamais exécutée comme du HTML. **Utiliser comme brouillon** copie la proposition dans le champ de message ; un brouillon existant n’est remplacé qu’après confirmation. L’utilisateur relit puis envoie lui-même selon les contrôles habituels de vérification des appareils et de chiffrement Matrix. L’IA peut se tromper ou suivre imparfaitement ses consignes : vérifier les faits et références.

## Frontière de confidentialité

Les conversations restent chiffrées de bout en bout dans Matrix. L’utilisation de l’IA constitue un partage volontaire supplémentaire : les extraits sélectionnés sont déchiffrés dans le navigateur puis transmis **en clair pour le traitement au service IA local**, au travers de la connexion HTTPS et du réseau Docker local. Ils ne bénéficient pas du chiffrement Matrix à l’intérieur du processus d’inférence.

La demande saisie et les extraits ne sont enregistrés ni en base ni dans l’historique des conversations par le service IA. La journalisation Docker du moteur est désactivée. Les données restent temporairement en mémoire pendant le traitement ; le modèle peut rester chargé dix minutes après une demande pour accélérer la suivante. Cette absence d’enregistrement applicatif ne garantit pas un effacement physique de la mémoire ou du fichier d’échange du système. Le bouton d’effacement et la fermeture du panneau retirent le contenu affiché ; aucune clé cryptographique Matrix n’est remise au modèle.

L’accès exige un jeton Matrix valide et un agent enrôlé. Pour des extraits, le serveur vérifie l’adhésion au salon et refuse les salons figés après révocation. Il recontrôle l’autorisation avant de retourner la réponse. L’accès à l’API Ollama brute n’est pas exposé par le proxy. Une demande est exécutée à la fois, au maximum quatre par utilisateur et par minute, avec un délai maximal de trois minutes. Une annulation coupe la requête d’inférence. Le premier chargement peut être long sur CPU ; les demandes suivantes sont plus rapides tant que le modèle reste chargé.

Les extraits sont présentés au modèle comme des données non fiables. Cela réduit les instructions malveillantes contenues dans un message sans garantir que le modèle les ignore toujours. L’absence d’outils et d’envoi autonome limite leur effet à la proposition visible.

## Vérifications

```powershell
node --test admin/assistant.test.mjs
npm run --prefix client check
```

Les tests unitaires vérifient les accords requis, les limites d’entrée, le modèle fixe, la concurrence, le refus des modèles cloud et le refus de retourner une réponse après perte d’autorisation. Les essais réels du modèle et de l’API sont documentés dans `VERIFICATION.md` après exécution.

Sources : [documentation officielle Ollama](https://docs.ollama.com/faq), [Qwen 3.5 dans le registre Ollama](https://ollama.com/library/qwen3.5), [sources Qwen](https://github.com/QwenLM/Qwen3.5).
