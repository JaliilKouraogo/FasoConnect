export async function installUpdates(
  isBusy: () => boolean,
  report: (text: string) => void,
) {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(
      "/service/sw.js",
      { scope: "/service/", updateViaCache: "none" },
    );
    const offer = () => {
      if (
        !registration.waiting ||
        !navigator.serviceWorker.controller ||
        document.getElementById("update")
      )
        return;
      const b = document.createElement("button");
      b.id = "update";
      b.textContent = "Une nouvelle version est prête · Actualiser";
      b.onclick = () => {
        if (isBusy()) {
          report("Attendez la fin de l’envoi.");
          return;
        }
        const draft = [...document.querySelectorAll("textarea")].some((t) =>
          t.value.trim(),
        );
        if (
          draft &&
          !confirm(
            "Actualiser effacera les brouillons non envoyés. Continuer ?",
          )
        )
          return;
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => location.reload(),
          { once: true },
        );
        registration.waiting?.postMessage("ACTIVATE_APPROVED");
      };
      document.body.append(b);
    };
    offer();
    registration.onupdatefound = () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") offer();
      });
    };
    await registration.update();
    offer();
  } catch {
    /* Une absence de réseau ne bloque pas l’ouverture de la messagerie. */
  }
}
