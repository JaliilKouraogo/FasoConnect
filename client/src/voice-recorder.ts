// Enregistrement et préécoute locaux ; seul le callback d'envoi chiffre et transfère.
export function openVoiceRecorder({ panel, button, node, upload }: any) {
  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  )
    throw new Error(
      "L’enregistrement vocal n’est pas disponible dans ce navigateur. Vous pouvez joindre un fichier audio.",
    );
  const p = panel("Message vocal"),
    status = node(
      "p",
      "Choisissez la langue parlée, puis démarrez l’enregistrement. Maximum : deux minutes et 10 Mo.",
    );
  status.setAttribute("role", "status");
  const language = node("select") as HTMLSelectElement;
  language.id = "voice-language";
  for (const [value, label] of [
    ["", "Choisir la langue parlée"],
    ["mos", "Mooré"],
    ["dyu", "Dioula"],
    ["ff", "Fulfuldé"],
    ["fr", "Français"],
    ["other", "Autre langue"],
  ]) {
    const option = node("option", label);
    option.value = value;
    language.append(option);
  }
  const label = node("label", "Langue du message");
  label.setAttribute("for", language.id);
  const player = node("audio") as HTMLAudioElement;
  player.controls = true;
  player.hidden = true;
  player.preload = "metadata";
  let recorder: MediaRecorder,
    stream: MediaStream,
    chunks: Blob[] = [],
    clip: Blob;
  let url = "",
    timer: ReturnType<typeof setTimeout>,
    tick: ReturnType<typeof setInterval>;
  let started = 0,
    duration = 0,
    size = 0,
    failed = false;
  const stopTracks = () => {
    stream?.getTracks().forEach((track) => track.stop());
    clearTimeout(timer);
    clearInterval(tick);
  };
  const start = node(
    "button",
    "Démarrer l’enregistrement",
  ) as HTMLButtonElement;
  start.type = "button";
  start.onclick = async () => {
    if (recorder?.state === "recording") return;
    start.disabled = true;
    try {
      if (!language.value)
        throw new Error("Choisissez la langue que vous allez parler.");
      if (!navigator.onLine)
        status.textContent =
          "Enregistrement local hors ligne. Une connexion sera nécessaire pour l’envoi.";
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!p.isConnected) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      try {
        recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
      } catch (error) {
        stopTracks();
        throw error;
      }
      chunks = [];
      size = 0;
      failed = false;
      clip = undefined;
      language.disabled = true;
      if (url) URL.revokeObjectURL(url);
      player.hidden = true;
      player.removeAttribute("src");
      send.disabled = true;
      stop.disabled = false;
      started = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          size += event.data.size;
        }
        if (size > 10 * 1024 * 1024 && recorder.state === "recording")
          recorder.stop();
      };
      recorder.onerror = () => {
        failed = true;
        status.textContent =
          "L’enregistrement a échoué. Recommencez avant l’envoi.";
        stopTracks();
        send.disabled = true;
      };
      recorder.onstop = () => {
        duration = Math.min(120000, Date.now() - started);
        stopTracks();
        stop.disabled = true;
        start.disabled = false;
        if (!p.isConnected || failed) {
          chunks = [];
          return;
        }
        language.disabled = false;
        clip = new Blob(chunks, {
          type: recorder.mimeType || chunks[0]?.type || "audio/webm",
        });
        chunks = [];
        if (!clip.size || clip.size > 10 * 1024 * 1024) {
          status.textContent =
            "Enregistrement vide ou trop volumineux. Recommencez.";
          send.disabled = true;
          return;
        }
        url = URL.createObjectURL(clip);
        player.src = url;
        player.hidden = false;
        status.textContent = `Enregistrement local : ${Math.ceil(duration / 1000)} s · ${Math.ceil(clip.size / 1024)} Ko. Écoutez-le avant de l’envoyer.`;
        send.disabled = false;
        start.textContent = "Recommencer l’enregistrement";
      };
      recorder.start(250);
      start.disabled = true;
      tick = setInterval(() => {
        status.textContent = `Enregistrement en cours : ${Math.floor((Date.now() - started) / 1000)} s / 120 s`;
      }, 1000);
      timer = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 120000);
    } catch (error: any) {
      status.textContent =
        error.name === "NotAllowedError"
          ? "Accès au microphone refusé. Vous pouvez autoriser le microphone dans les paramètres du navigateur ou joindre un fichier audio."
          : error.message || "Enregistrement impossible.";
      stopTracks();
    } finally {
      start.disabled = recorder?.state === "recording";
    }
  };
  const stop = button("Arrêter et écouter", () => {
    if (recorder?.state === "recording") recorder.stop();
  });
  stop.disabled = true;
  const send = button(
    "Chiffrer et envoyer le vocal",
    async () => {
      if (!clip || !language.value)
        throw new Error("Enregistrez un message et précisez sa langue.");
      await upload(clip, { duration, language: language.value });
      status.textContent = "Message vocal chiffré envoyé.";
      p.dispatchEvent(new Event("faso-close"));
      p.remove();
    },
    "primary",
  );
  send.disabled = true;
  p.append(
    label,
    language,
    status,
    start,
    stop,
    player,
    send,
    node(
      "small",
      "Aucune transcription ni traduction automatique. Fermer cette fenêtre supprime l’enregistrement non envoyé.",
    ),
  );
  p.addEventListener(
    "faso-close",
    () => {
      if (recorder?.state === "recording") recorder.stop();
      stopTracks();
      player.pause();
      player.removeAttribute("src");
      if (url) URL.revokeObjectURL(url);
      clip = undefined;
      chunks = [];
    },
    { once: true },
  );
}
