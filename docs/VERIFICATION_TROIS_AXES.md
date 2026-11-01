# Vérification locale des trois axes — 1er novembre 2026

Cette recette utilise deux comptes QA exclusivement fictifs et deux contextes Edge séparés via Playwright, avec autorisation de l'utilisateur. Aucun profil personnel ni compte de démonstration existant n'a été réinitialisé. Les captures ne contiennent ni mot de passe, ni code, ni secret TOTP. Le parcours vocal ci-dessous décrit l'ancienne fenêtre avec choix de langue ; le nouveau composeur avec micro direct reste à vérifier sur navigateur et téléphone.

## Vérifications réussies

1. **Connexion — réussie.** Mot de passe, TOTP, activation du profil et ouverture de la messagerie pour un responsable et un agent fictifs.
2. **Appareils — réussie.** Groupe sur invitation, acceptation par l'agent ; clés affichées comparées sur les deux navigateurs avant confirmation des appareils.
3. **Dossier et instruction — réussis.** Création d'un dossier chiffré, instruction rattachée, réception et déchiffrement dans le second navigateur.
4. **Exécution — réussie.** Prise de connaissance distincte du travail ; commencer, soumettre un commentaire, valider par le responsable ; la validation est visible sur l'autre navigateur.
5. **Notes et documents — réussis.** Note et document rattachés au dossier. Le destinataire télécharge et déchiffre le fichier ; comparaison des octets réussie avec le fichier fictif initial.
6. **Coupure avant envoi — réussie.** Passage hors ligne, tentative refusée, brouillon conservé, retour en ligne, reprise explicitement demandée et une seule réception. La perte de réponse après acceptation serveur n'a pas été reproduite ici ; la stabilité de transaction et la réutilisation d'événement sont couvertes par les tests unitaires.
7. **Vocal synthétique — réussi techniquement.** Microphone synthétique du navigateur, choix de langue, arrêt, préécoute locale, transfert, déchiffrement et lecteur audio chez le destinataire. Le signal n'est pas un enregistrement réel en mooré : aucune validation linguistique n'en découle.
8. **Petite largeur — vérifiée à 390 × 844.** Aucun débordement horizontal de la page pendant ce scénario. Ce contrôle ne vaut pas qualification d'un téléphone physique ni audit d'accessibilité complet.
9. **Ancienne API IA — retirée lors de cette recette.** Une requête POST réelle vers `/assistant/api/run` recevait HTTP 410. L'assistant local a depuis été réintroduit avec sélection explicite des extraits ; cette preuve historique ne qualifie pas la nouvelle interface IA.

## Code et construction

- 31 tests JavaScript couvrant les suites existantes et les nouveaux dossiers, transitions, refus, conflits, doublons, références manquantes, reprise et abandon d'envoi.
- Quatre contrôles statiques Python et huit tests de politique Synapse réussis.
- Compilation TypeScript et construction Vite/Docker réussies ; client et administration sains après déploiement.
- Configuration Compose et absence d'erreurs d'espacement dans le diff vérifiées. Le script Installer-Local.ps1 a été analysé syntaxiquement ; son exécution complète sur une autre machine vierge n'est pas revendiquée.

## Défaut trouvé et corrigé pendant la recette

Une action de suivi pouvait être confirmée alors que l'accusé précédent était encore en cours d'envoi. Le contrôle de concurrence refusait alors la nouvelle action. Les boutons de confirmation concernés sont désormais désactivés pendant l'envoi et réactivés ensuite. Le parcours a été rejoué avec succès après correction.

## Captures inspectées

- [Instruction validée](captures/01-instruction-validee.png).
- [Dossier, note et document](captures/02-dossier.png).
- [Conversation à petite largeur](captures/03-mobile.png).

Les captures montrent un prototype fonctionnel. Les petits textes, les contrastes, la navigation au clavier, les panneaux longs et l'ergonomie complète doivent encore être évalués ; elles ne constituent pas une validation exhaustive du design.

## Points encore ouverts

- Traductions mooré à fournir/valider par l'équipe dans TRADUCTIONS_MOORE.json ; interface actuellement française.
- Microphones et lecture audio sur téléphones réels, échange effectivement parlé en mooré et taille/durée aux limites.
- Nouvelle recette de révocation sur deux appareils avec les nouvelles fonctions ; les tests de révocation existants ont passé, mais ce scénario réel n'a pas été rejoué dans cette recette.
- Inspection complète base/médias/trafic des nouveaux contenus, charge et concurrence réelles. Les tests unitaires de rejet ne remplacent pas un audit indépendant.
- Historique des habilitations, clôture/réouverture des dossiers, réassignation et archivage légal non implémentés.
- Mise en page finale des notes de deux pages et du README, vidéo et publication du dépôt : restent des éléments distincts du fonctionnement local.
