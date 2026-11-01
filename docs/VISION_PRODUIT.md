# FasoConnect — vision et critères d'acceptation

## But

Permettre aux agents publics de communiquer, organiser les échanges autour de dossiers administratifs et suivre une instruction jusqu'à sa réalisation, sur une infrastructure maîtrisée. Le produit doit rester utilisable avec peu de formation et une connexion instable.

Ce cadrage s'appuie sur les cinq pages de Sprint_Technique_Pre-Hackathon_2026-KFD.pdf et sur la lecture des modules de Toundapp. Aucun résultat de test de Toundapp n'est présumé. L'utilisateur a confirmé les trois axes dès cette version : instructions, dossiers et faible connexion/langues nationales. Les fonctions effectivement implémentées et leurs limites sont distinguées ci-dessous.

## Contraintes qui s'appliquent à chaque fonctionnalité

- Messages et fichiers chiffrés de bout en bout par les bibliothèques Matrix officielles, sans cryptographie maison ni repli en clair.
- Aucun contenu de dossier, instruction, commentaire, tâche, résultat ou recherche lisible par le serveur. Les événements d'état Matrix, noms de salons et sujets ne sont pas confidentiels : ils ne doivent pas recevoir de titres de dossiers sensibles.
- Agents préalablement enrôlés, second facteur obligatoire, rôles contrôlés, invitations explicites et vérification des appareils avant envoi.
- Révocation sur tous les appareils et gel des anciens salons. Aucun renvoi automatique de brouillon vers un successeur ; aucun transfert automatique d'un contenu ancien vers de nouveaux membres.
- Données exclusivement fictives dans la démonstration et les tests. Dépôt public, licence, inventaire des composants et historique progressif.
- Déploiement autonome en une commande ; téléchargement initial des dépendances distingué du fonctionnement sans service tiers indispensable.
- Limites documentées : copies déjà reçues, perte des clés, métadonnées, serveur distribuant le JavaScript et appareils compromis.

## Parcours et droits

| Acteur | Peut faire | Restriction |
|---|---|---|
| Agent | Consulter ses conversations/dossiers, recevoir une instruction, accuser réception, faire avancer son travail et soumettre un résultat | Ne publie pas d'instruction au nom d'un responsable et ne valide pas son propre résultat |
| Responsable | Ouvrir un dossier avec les agents autorisés, publier une instruction, choisir les exécutants, fixer une échéance, examiner le résultat, clôturer ou demander une reprise | Doit être membre du salon et disposer des droits du salon ; rôle global seul insuffisant |
| Administrateur | Enrôler, gérer les rôles, révoquer un compte ou appareil, exploiter les services | Le rôle administrateur ne donne pas les clés des dossiers |

## Axe 1 — Instruction jusqu'à exécution

1. Le responsable renseigne un objet, un contenu, une priorité, des destinataires et éventuellement une échéance.
2. Chaque destinataire confirme explicitement sa prise de connaissance. Cet accusé reste distinct de l'avancement du travail.
3. Chaque exécutant passe son travail en cours, puis le soumet pour validation. Une soumission peut contenir un commentaire chiffré ; un fichier de résultat suit le mécanisme de pièce jointe chiffrée existant.
4. L'auteur responsable valide le travail soumis ou demande une reprise. La clôture globale n'est obtenue que lorsque tous les exécutants concernés sont validés.
5. Un suivi dans le navigateur présente les personnes, l'avancement et les échéances ; les compteurs sont calculés à partir des événements déchiffrés accessibles.

### Règles de cohérence

- Chaque changement référence l'instruction, le salon et l'exécutant concernés. Un agent ne peut pas modifier le travail d'un autre.
- Les transitions incohérentes, auteurs sans droit, références absentes, événements non déchiffrés ou effacés sont ignorés et ne produisent aucun statut de réussite.
- Les événements sont conservés comme un historique ; aucune mutation d'un simple champ de base serveur pour prétendre qu'une action est validée.
- Plusieurs appareils peuvent produire des événements concurrents : chaque changement référence l'événement précédent, les doublons sont dédupliqués et une branche concurrente n'écrase pas silencieusement une validation.
- Une instruction existante ne change pas rétroactivement ses destinataires. Réassigner ou modifier substantiellement exige une opération explicite et traçable.
- Une instruction n'est jamais déclarée entièrement traitée si l'historique requis manque : afficher « historique incomplet » et permettre de charger les événements précédents.
- Une échéance saisie est associée à un instant avec fuseau ; affichage dans le fuseau local, sans comparaison de chaînes de dates.
- Un retard est un indicateur calculé, pas un changement d'état du travail ni une notification serveur contenant du texte sensible.
- Les droits historiques et les droits actuels doivent être distingués. Un changement de rôle ne doit pas fabriquer de faux événements anciens ni autoriser une nouvelle action interdite.
- Un accusé n'est pas une preuve juridique automatique. Une validation d'exécution reste une décision opérationnelle.

## Axe 2 — Dossiers administratifs

- Un dossier regroupe une conversation chiffrée, des instructions et des documents. Ne pas ajouter de serveur de messages parallèle.
- La référence et le titre métier sensibles sont transmis dans un événement chiffré. Le serveur ne reçoit qu'un nom de salon générique si un nom est nécessaire.
- Le responsable choisit les membres depuis l'annuaire ; aucun accès automatique à tous les agents d'un ministère.
- La clôture d'un dossier est distincte d'une révocation. Elle exige des règles explicites de réouverture et ne prétend pas fournir un archivage légal.
- Une conversation renouvelée après révocation présente clairement le lien avec l'ancienne et les éléments qui ne sont pas repris. La reprise d'une instruction est explicite, après vérification des droits et des appareils.
- Les nouveaux membres n'obtiennent pas automatiquement les clés d'anciens documents. L'interface explique les limites de l'historique disponible.

## Axe 3 — Accessibilité et faible connexion

- Brouillons conservés en mémoire par conversation, jamais en texte clair sur disque par défaut. Pas de perte silencieuse au simple passage d'une conversation à une autre.
- Indicateur de connexion, distinction en cours/échoué/envoyé, nouvelle tentative explicite avec identifiant de transaction stable pour éviter les doublons.
- Avant une nouvelle tentative, recontrôler compte, salon, appartenance et appareils ; un brouillon n'est pas une autorisation d'envoi permanente.
- Aucun accusé ou changement de statut affiché comme confirmé avant acceptation de l'événement. Échec réseau affiché à proximité de l'action.
- Aucun préchargement automatique de gros fichiers. Taille visible avant transfert ; limite actuelle 10 Mo conservée tant qu'elle n'est pas requalifiée.
- La langue nationale à intégrer sera choisie avec l'équipe et ses traductions validées par un locuteur. Ne pas inventer de traduction ni confondre une interface français/anglais avec ce bonus.
- Le vocal exige chiffrement avant transfert, consentement du microphone, durée/taille bornées et possibilité d'écouter avant envoi. Il n'est pas déclaré acquis à partir du composant audio de Toundapp.
- Parcours clavier, focus visible, libellés persistants, erreurs reliées aux champs, actions compréhensibles sans dépendre uniquement des couleurs et présentation adaptée au téléphone.

## Présentation à améliorer

- Connexion : identifiant complet, explication des étapes, nom d'appareil libre illustré, expiration avec possibilité de recommencer.
- Accueil : action principale évidente et distinction conversations/dossiers/instructions sans multiplier les rubriques.
- Conversation : écrire et joindre un fichier accessibles ; actions secondaires regroupées ; statut de chiffrement compréhensible.
- Instruction : destinataires explicites, échéance lisible, statut individuel et bouton adapté au rôle et à l'étape.
- Erreurs : proposer une action utile sans exposer les messages techniques du serveur.
- Toute refonte visuelle doit être vérifiée sur des captures des écrans réels. Aucun audit visuel complet n'a encore été réalisé dans cette session.

## Recette et preuves à conserver

| Scénario | Résultat attendu |
|---|---|
| Agent non enrôlé ou rôle insuffisant | Refus, aucune action sensible créée |
| Texte et fichier entre deux agents | Déchiffrables uniquement par les destinataires autorisés |
| Inspection serveur et trafic | Aucun contenu ou fichier de démonstration lisible |
| Instruction → accusé → travail → soumission → validation | Statuts cohérents pour plusieurs agents et deux appareils |
| Usurpation, mauvaise référence, transition illégale | Rejet côté destinataire sans avancement affiché |
| Événements doublés, concurrents ou reçus dans le désordre | Résultat déterministe ; aucun écrasement silencieux |
| Historique partiel ou clés manquantes | État incomplet visible, jamais de fausse clôture |
| Révocation pendant un groupe | Anciennes sessions refusées, nouveaux événements inaccessibles, successeur contrôlé |
| Coupure puis nouvelle tentative | Brouillon préservé en mémoire, pas de doublon et droits revérifiés |
| Clavier, téléphone et changement de langue | Parcours principaux utilisables ; limites non testées déclarées |

## Livraison concours

- Prioriser une innovation principale démontrable ; ne pas présenter les axes non terminés comme acquis.
- Pré-projet et note de sécurité : deux pages maximum chacun. README français : deux pages maximum. Vidéo : trois minutes maximum.
- Fiche équipe de deux à trois étudiants du même établissement et attestations 2026–2027.
- Dépôt public avec licence et comptes fictifs utilisables ; ne jamais y publier les secrets locaux.
- Préparer les cinq familles d'épreuves : serveur, révocation, intrus, innovation et explication du code ; le jury en choisit trois.
- Retirer du parcours concours l'analyse des extraits déchiffrés par l'IA côté serveur tant que sa conformité n'est pas résolue. L'arrêt d'Ollama seul n'est pas une suppression du chemin de transmission.
- Chaque membre doit expliquer les mécanismes présentés. Aucun résultat de sécurité ou mobile non observé ne doit être revendiqué.

## État de cette première version des trois axes

- Instructions : destinataires choisis, référence de dossier facultative, progression individuelle, soumission, validation ou reprise motivée par l'auteur. Chaque changement référence le précédent ; les conflits et références absentes bloquent une fausse clôture.
- Dossiers : référence, titre et description chiffrés dans une conversation existante ; instructions rattachées, notes et documents chiffrés. Les droits sont ceux de la conversation. Pas encore de clôture/réouverture des dossiers, d'archivage légal, d'agenda ou de réassignation.
- Faible connexion : brouillons par conversation en mémoire seulement, absence de renvoi automatique des messages, reprise avec la même transaction/événement Matrix et contrôle des droits avant chaque tentative. Les nouveaux fichiers nécessitent une connexion ; une actualisation ferme les brouillons en mémoire.
- Langues nationales : mooré retenu par l'utilisateur, avec validation des textes par son équipe. Enregistrement vocal avec langue parlée explicitement choisie, préécoute locale, chiffrement du fichier avant transfert, lecture après déchiffrement. Deux minutes et 10 Mo maximum. Interface encore française ; aucune traduction ou transcription automatique ni traduction nationale validée revendiquée. Le catalogue à compléter est dans TRADUCTIONS_MOORE.json.
- IA : parcours retiré du client et route administrative remplacée par une réponse HTTP 410 avant lecture du corps. Ollama n'est plus démarré par défaut.
- Les rôles de publication sont encore vérifiés contre l'annuaire et les droits actuels du salon. Une modification de rôle peut rendre une ancienne instruction/dossier indisponible dans cette vue ; un historique des habilitations reste à concevoir.
- Le suivi porte sur la timeline chargée et déchiffrée. La pagination est explicite ; les panneaux doivent être actualisés pour voir les nouvelles actions. Les langues et le vocal doivent être validés avec l'équipe et sur téléphones physiques.
