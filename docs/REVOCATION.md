# Révocation et barrière effective

Une opération est persistée puis sérialisée par un verrou PostgreSQL. Les salons déjà archivés par une précédente barrière sont exclus.

1. Inscrire les anciens salons actifs dans faso_frozen_rooms en transaction atomique : le module refuse ensuite leurs événements de contenu, même chiffrés.
2. Désactiver l’identité Keycloak et fermer ses sessions de reconnexion.
3. Désactiver Matrix : jetons, appareils et départs des salons selon l’API Synapse.
4. Créer les successeurs privés, chiffrés, historique joined, pour les membres restants. Un nouveau room_id impose de nouvelles sessions Megolm aux émetteurs honnêtes.
5. Utiliser les droits déjà détenus par un membre pour un tombstone, ou les invitations et le catalogue authentifié des successeurs. Aucune nouvelle élévation du compte technique. Cette navigation ne constitue pas la barrière de sécurité.
6. Vérifier que les appareils ciblés ne sont plus listés, puis seulement déclarer effective l’opération.

Les alias de successeurs sont déterministes ; une reprise vérifie l’identifiant d’opération dans la création du salon avant de le réutiliser. Un redémarrage du service marque les opérations interrompues comme partielles, à reprendre après réauthentification. Aucun dégel automatique.

Pour un appareil perdu : fermer les sessions Keycloak, supprimer le device_id et ses jetons, migrer les salons actifs ; le compte reste actif. Si le détenteur possède encore tous les facteurs d’authentification, une récupération des facteurs est nécessaire : un device_id n’identifie pas physiquement une machine.

`t0` est l’enregistrement ; `t_effectif` suit gel, coupure et vérifications de création des successeurs. Un envoi autorisé avant gel appartient à l’ancien salon ; les nouveaux échanges opérationnels utilisent exclusivement les successeurs. L’historique ne migre pas et reste accessible selon les anciennes clés. Les anciens appareils peuvent garder leurs anciennes clés, qui ne déchiffrent pas un nouveau salon.

Le client vérifie l’accès toutes les cinq secondes et se verrouille sur 401. Le refus serveur peut précéder le verrouillage visuel. Les brouillons de salons renouvelés sont effacés sans envoi ; aucune queue de texte clair persistée.

Recette : agent sur deux appareils, sync et médias 401, nouveau message non déchiffrable sur les deux anciens moteurs, conversation poursuivie par les autres. Mesures locales : 591 ms pour l’agent, 1 149 ms pour un appareil seul. Aucun SLA ; partitions, charge et interleavings nécessitent une qualification plus large.
