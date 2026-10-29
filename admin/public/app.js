let csrf;
const messages = {
  CONNEXION_REQUISE: "Connectez-vous avec votre second facteur.",
  REAUTHENTIFICATION_REQUISE:
    "Réauthentifiez-vous avant cette action sensible.",
  ROLE_ADMINISTRATEUR_REQUIS: "Cette console est réservée aux administrateurs.",
  RESOUDRE_OPERATION_EN_COURS:
    "Terminez ou reprenez la révocation déjà en cours.",
  CSRF: "La session de sécurité a changé. Rechargez la page.",
  DONNEES_INVALIDES: "Vérifiez les champs du formulaire.",
  TROP_DE_TENTATIVES: "Trop de demandes. Réessayez dans un instant.",
};
const human = (e) =>
  messages[e.message] || "L’action n’a pas abouti : " + e.message;
const el = (id) => document.getElementById(id);
const status = (text) => (el("status").textContent = text);
async function api(path, data) {
  const r = await fetch("/admin/api/" + path, {
    method: data ? "POST" : "GET",
    headers: data
      ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
      : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error);
  return result;
}
function button(text, action) {
  const b = document.createElement("button");
  b.textContent = text;
  b.onclick = async () => {
    b.disabled = true;
    try {
      await action();
      await load();
    } catch (e) {
      status(human(e));
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
async function load() {
  try {
    const s = await api("session");
    csrf = s.csrf;
    status(
      "Connecté : " +
        s.username +
        (s.fresh
          ? " · authentification récente"
          : " · réauthentification requise pour une nouvelle action"),
    );
    const [agents, operations] = await Promise.all([
      api("agents"),
      api("revocations"),
    ]);
    el("agents").replaceChildren();
    for (const a of agents) {
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.textContent =
        a.username + " · " + (a.enabled ? "Actif" : "Désactivé");
      row.append(name);
      if (a.enabled && a.username !== s.username) {
        const device = document.createElement("input");
        device.placeholder = "Appareil perdu (facultatif)";
        device.setAttribute(
          "aria-label",
          "Identifiant appareil de " + a.username,
        );
        row.append(
          device,
          button("Révoquer", async () => {
            if (
              !confirm(
                "Révoquer " +
                  a.username +
                  (device.value
                    ? " / appareil " + device.value
                    : " sur tous ses appareils") +
                  " et renouveler ses conversations ?",
              )
            )
              return;
            await api("revoke", {
              username: a.username,
              device: device.value || undefined,
            });
            status(
              "Révocation lancée. Les erreurs éventuelles restent visibles.",
            );
          }),
        );
      }
      row.append(
        button("Appareils", async () => {
          const devices = await api(
            "devices?username=" + encodeURIComponent(a.username),
          );
          status(
            devices.length
              ? devices.map((d) => d.id + " · " + d.name).join(" | ")
              : "Aucun appareil actif.",
          );
        }),
      );
      row.append(
        button("Annuaire", () => {
          el("directory-editor").hidden = false;
          const form = el("directory-form");
          for (const key of [
            "username",
            "name",
            "ministere",
            "direction",
            "fonction",
          ])
            form.elements.namedItem(key).value = a[key] || "";
          el("directory-editor").scrollIntoView({ behavior: "smooth" });
        }),
      );
      if (!a.enabled)
        row.append(
          button("Réautoriser", async () => {
            const r = await api("reauthorize", { username: a.username });
            el("activation").textContent =
              r.username +
              "\nMot de passe temporaire : " +
              r.temporaryPassword +
              "\n" +
              r.activation;
          }),
        );
      el("agents").append(row);
    }
    el("operations").replaceChildren();
    for (const op of operations) {
      const box = document.createElement("div");
      box.className = "operation " + op.status;
      const title = document.createElement("strong");
      title.textContent =
        op.username +
        " · " +
        ({
          running: "En cours",
          partial: "Échec partiel",
          effective: "Effective",
        }[op.status] || op.status);
      const detail = document.createElement("p");
      detail.textContent =
        "Salons traités : " +
        (op.rooms?.filter((r) => r.done).length || 0) +
        " / " +
        (op.rooms?.length || 0) +
        (op.elapsedMs ? " · " + (op.elapsedMs / 1000).toFixed(2) + " s" : "") +
        (op.error ? " · " + op.error : "");
      box.append(title, detail);
      if (op.status === "partial")
        box.append(
          button("Reprendre après réauthentification", () =>
            api("retry", { id: op.id }),
          ),
        );
      el("operations").append(box);
    }
  } catch (e) {
    status(
      e.message === "CONNEXION_REQUISE"
        ? "Connectez-vous avec un compte administrateur et son TOTP."
        : e.message,
    );
  }
}
el("enroll").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const result = await api(
      "enroll",
      Object.fromEntries(new FormData(e.target)),
    );
    el("activation").textContent =
      result.username +
      "\nMot de passe temporaire : " +
      result.temporaryPassword +
      "\nCode d’activation : " +
      (result.activationCode || "sans objet") +
      "\n" +
      result.activation;
    await load();
  } catch (error) {
    status(human(error));
  }
};
load();
setInterval(load, 5000);

el("directory-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("directory", Object.fromEntries(new FormData(e.target)));
    status("Annuaire enregistré.");
    el("directory-editor").hidden = true;
  } catch (error) {
    status(human(error));
  }
};
