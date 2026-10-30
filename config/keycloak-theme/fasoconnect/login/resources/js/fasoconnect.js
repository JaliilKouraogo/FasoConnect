document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#kc-form-login, #kc-otp-login-form");
  if (!form) return;
  const otp = document.getElementById("otp");
  const hint = document.createElement("p");
  hint.className = "faso-login-hint";
  hint.id = "faso-login-help";
  hint.textContent = otp
    ? "Ouvrez votre application d’authentification, choisissez FasoConnect, puis recopiez les 6 chiffres affichés. Le code change toutes les 30 secondes."
    : "Retrouvez vos conversations et votre équipe en quelques instants.";
  form.prepend(hint);
  if (otp) {
    const title = document.getElementById("kc-page-title");
    if (title) title.textContent = "Une dernière vérification.";
    otp.setAttribute("inputmode", "numeric");
    otp.setAttribute("autocomplete", "one-time-code");
    otp.setAttribute(
      "aria-describedby",
      [otp.getAttribute("aria-describedby"), hint.id].filter(Boolean).join(" "),
    );
  }
});
