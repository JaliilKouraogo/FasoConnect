"""Crée un jeu de comptes fictifs isolé et conserve les accès hors du dépôt."""

import json
import os
import pathlib
import secrets
import subprocess

from paths import ROOT, compose, private_dir


ACCOUNTS = {
    "recette.responsable": "responsable",
    "recette.agent1": "agent",
    "recette.agent2": "agent",
    "recette.admin": "administrateur",
}
PRIVATE = private_dir()
SECRETS = PRIVATE / "identifiants-recette.json"
LIST = PRIVATE / "identifiants-recette.md"


def run(args, data=None):
    result = subprocess.run(
        compose() + ["exec", "-T", "identity"] + args,
        input=data,
        text=True,
        capture_output=True,
        cwd=ROOT,
        check=False,
    )
    if result.returncode:
        raise SystemExit("Échec de création des comptes fictifs dans Keycloak.")
    return result.stdout


def save_secrets(records):
    temporary = SECRETS.with_suffix(".tmp")
    temporary.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, SECRETS)


def main():
    if PRIVATE.resolve() == ROOT.resolve():
        raise SystemExit("Configurer un dossier privé hors du dépôt dans local.settings.json.")
    if not (PRIVATE / ".env").is_file():
        raise SystemExit("Configuration privée absente ; lancer Installer-Local.ps1.")
    records = json.loads(SECRETS.read_text(encoding="utf-8")) if SECRETS.exists() else {}
    run([
        "sh", "-c",
        '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null',
    ])
    existing = {
        user["username"]
        for user in json.loads(run([
            "/opt/keycloak/bin/kcadm.sh", "get", "users", "-r", "fasoconnect", "--fields", "username"
        ]))
    }
    for name, role in ACCOUNTS.items():
        if name in existing:
            if name not in records:
                raise SystemExit(f"{name} existe déjà sans secret local ; aucun mot de passe n'a été réinitialisé.")
            continue
        if name not in records:
            records[name] = {"role": role, "temporary_password": secrets.token_urlsafe(24)}
            save_secrets(records)
        user = {
            "username": name,
            "enabled": True,
            "firstName": name,
            "lastName": "Recette",
            "email": name + "@example.invalid",
            "requiredActions": ["UPDATE_PASSWORD", "CONFIGURE_TOTP"],
            "credentials": [{
                "type": "password",
                "value": records[name]["temporary_password"],
                "temporary": True,
            }],
            "attributes": {
                "ministere": ["Ministère fictif de la Simulation"],
                "direction": ["Direction fictive"],
            },
        }
        run(["/opt/keycloak/bin/kcadm.sh", "create", "users", "-r", "fasoconnect", "-f", "-"], json.dumps(user))
        run(["/opt/keycloak/bin/kcadm.sh", "add-roles", "-r", "fasoconnect", "--uusername", name, "--rolename", role])

    synchronized = subprocess.run(
        compose() + ["run", "--rm", "--no-deps", "init"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if synchronized.returncode:
        raise SystemExit("Comptes créés ; la synchronisation de l'annuaire a échoué.")

    lines = [
        "# Accès fictifs pour la recette FasoConnect",
        "",
        "Messagerie : https://localhost/service/ · Administration : https://localhost/admin/",
        "",
        "| Identifiant | Rôle | Mot de passe temporaire |",
        "| --- | --- | --- |",
    ]
    for name, role in ACCOUNTS.items():
        lines.append(f"| `{name}` | {role} | `{records[name]['temporary_password']}` |")
    lines += [
        "",
        "À la première connexion, choisir un nouveau mot de passe et configurer le TOTP avec une application d'authentification.",
        "Le mot de passe temporaire cesse alors de fonctionner. Conserver le nouveau mot de passe et le TOTP dans un gestionnaire de mots de passe.",
        "Utiliser des profils de navigateur distincts pour les agents. Ces comptes et leurs données sont exclusivement fictifs.",
        "",
        "## Parcours de test conseillé",
        "",
        "1. Activer le responsable et les deux agents dans trois profils de navigateur distincts.",
        "2. Le responsable crée un groupe et invite les deux agents ; chaque agent accepte l'invitation et vérifie les appareils.",
        "3. Créer un dossier fictif, y ajouter une note, un document et une instruction destinée aux deux agents.",
        "4. Chaque agent fait avancer son travail ; le responsable demande une reprise, puis valide la nouvelle soumission.",
        "5. Envoyer un vocal court, le préécouter, puis vérifier sa réception et sa lecture sur un autre profil.",
        "6. Réserver `recette.admin` au test final de révocation : cette action invalide les sessions et modifie les conversations.",
        "",
    ]
    LIST.write_text("\n".join(lines), encoding="utf-8")
    os.chmod(LIST, 0o600)
    print(f"Quatre comptes fictifs prêts. Liste privée : {LIST}")


if __name__ == "__main__":
    main()
