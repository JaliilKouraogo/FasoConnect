# PWA et stockage local

Manifest et icône locaux, mode autonome. Installation via Chrome/Edge ou « Sur l’écran d’accueil » Safari iOS si proposée, avec certificat de confiance. Aucune installation universelle sur tous les OS n’est attestée.

Le service worker ne précache que la liste de fichiers statiques du build : HTML, JS, CSS, WASM, manifest et icône. Aucun endpoint Matrix, annuaire, média ou réponse avec paramètre sensible. Cache-Control HTTP no-store. Messages déchiffrés et brouillons ne sont pas écrits sur disque par l’application.

Les clés sont dans IndexedDB du SDK ; stockage sensible à protéger avec l’appareil. Les jetons dans sessionStorage survivent au rechargement d’un onglet. Web Locks empêche deux instances simultanées d’utiliser ce magasin. Perdre toutes les clés peut rendre l’historique illisible ; l’export/import ergonomique des clés n’est pas réalisé dans ce client.

Une nouvelle version attend un bouton d’activation. L’activation est refusée pendant un envoi, confirme la perte d’un éventuel brouillon et attend controllerchange avant rechargement. Pas d’activation brutale.

Hors ligne : shell statique seulement, brouillon en mémoire de la fenêtre, renvoi manuel après reconnexion et vérification. Fermer la fenêtre perd le brouillon. Une migration efface le brouillon de l’ancien salon sans envoi. Coupure réelle du proxy et idempotence des transactions testées.
