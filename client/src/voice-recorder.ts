// Le clip reste en mémoire dans le composeur jusqu'à l'envoi chiffré ou l'annulation.
type RecorderOptions = {
  composer: HTMLFormElement;
  trigger: HTMLButtonElement;
  hideWhileActive: HTMLElement[];
  upload: (clip: Blob, info: { duration: number }) => Promise<void>;
  report: (message: string) => void;
  refreshControls: () => void;
};

const MAX_DURATION = 120000;
const MAX_SIZE = 10 * 1024 * 1024;
const icons = {
  cancel: '<path d="M4 7h16M10 7V4h4v3m-8 0 1 13h10l1-13M10 11v5m4-5v5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  send: '<path d="m3 20 18-8L3 4l2 7 9 1-9 1-2 7Z"/>',
};

function action(label: string, icon: keyof typeof icons, className: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `voice-action ${className}`;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[icon]}</svg><span>${label}</span>`;
  return button;
}

export function createVoiceRecorder({
  composer,
  trigger,
  hideWhileActive,
  upload,
  report,
  refreshControls,
}: RecorderOptions) {
  const bar = document.createElement("div");
  bar.className = "voice-bar";
  bar.hidden = true;
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Message vocal");

  const cancel = action("Supprimer", "cancel", "voice-cancel");
  const stop = action("Arrêter", "stop", "voice-stop");
  const send = action("Envoyer", "send", "voice-send");
  const indicator = document.createElement("span");
  indicator.className = "voice-indicator";
  indicator.setAttribute("aria-hidden", "true");
  const clock = document.createElement("span");
  clock.className = "voice-clock";
  clock.textContent = "00:00";
  clock.setAttribute("aria-hidden", "true");
  const status = document.createElement("span");
  status.className = "voice-bar-status";
  status.setAttribute("role", "status");
  const player = document.createElement("audio");
  player.controls = true;
  player.preload = "metadata";
  player.hidden = true;
  const info = document.createElement("div");
  info.className = "voice-bar-info";
  info.append(indicator, clock, status);
  bar.append(cancel, info, player, stop, send);
  composer.append(bar);

  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let chunks: Blob[] = [];
  let clip: Blob | undefined;
  let url = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  let started = 0;
  let duration = 0;
  let size = 0;
  let sequence = 0;
  let disposed = false;
  let state: "idle" | "requesting" | "recording" | "ready" | "sending" = "idle";

  const stopTracks = () => {
    if (timer) clearTimeout(timer);
    if (tick) clearInterval(tick);
    timer = undefined;
    tick = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
  };
  const show = () => {
    hideWhileActive.forEach((element) => (element.hidden = true));
    trigger.hidden = true;
    bar.hidden = false;
  };
  const reset = () => {
    sequence++;
    if (recorder?.state === "recording") {
      recorder.onstop = null;
      recorder.stop();
    }
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
    }
    recorder = undefined;
    stopTracks();
    player.pause();
    player.removeAttribute("src");
    player.hidden = true;
    if (url) URL.revokeObjectURL(url);
    url = "";
    chunks = [];
    clip = undefined;
    size = 0;
    state = "idle";
    bar.classList.remove("is-recording", "is-ready", "is-sending");
    bar.hidden = true;
    cancel.disabled = false;
    stop.hidden = false;
    stop.disabled = true;
    send.disabled = true;
    hideWhileActive.forEach((element) => (element.hidden = false));
    trigger.hidden = false;
    refreshControls();
  };
  const fail = (message: string) => {
    reset();
    report(message);
  };

  const start = async () => {
    if (disposed || state !== "idle") return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      report(
        "Microphone indisponible dans ce navigateur. Vous pouvez joindre un fichier audio.",
      );
      return;
    }
    const current = ++sequence;
    state = "requesting";
    show();
    stop.disabled = true;
    send.disabled = true;
    status.textContent = "Autorisation du microphone…";
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (disposed || sequence !== current || state !== "requesting") {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks = [];
      size = 0;
      started = Date.now();
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.push(event.data);
        size += event.data.size;
        if (size > MAX_SIZE && recorder?.state === "recording") recorder.stop();
      };
      recorder.onerror = () => fail("L'enregistrement a échoué. Réessayez.");
      recorder.onstop = () => {
        stopTracks();
        if (disposed || sequence !== current || state !== "recording") return;
        duration = Math.min(MAX_DURATION, Date.now() - started);
        bar.classList.remove("is-recording");
        if (size > MAX_SIZE) {
          fail("Le vocal dépasse 10 Mo. Enregistrez un message plus court.");
          return;
        }
        clip = new Blob(chunks, {
          type: recorder?.mimeType || chunks[0]?.type || "audio/webm",
        });
        chunks = [];
        if (!clip.size) {
          fail("L'enregistrement est vide. Réessayez.");
          return;
        }
        url = URL.createObjectURL(clip);
        player.src = url;
        player.hidden = false;
        state = "ready";
        bar.classList.add("is-ready");
        clock.textContent = formatTime(duration);
        status.textContent = "Vocal prêt. Écoutez-le ou envoyez-le.";
        stop.hidden = true;
        send.disabled = false;
        send.focus();
      };
      recorder.start(250);
      state = "recording";
      bar.classList.add("is-recording");
      clock.textContent = "00:00";
      status.textContent = "Enregistrement en cours";
      stop.hidden = false;
      stop.disabled = false;
      stop.focus();
      tick = setInterval(() => {
        clock.textContent = formatTime(Date.now() - started);
      }, 1000);
      timer = setTimeout(() => {
        if (recorder?.state === "recording") recorder.stop();
      }, MAX_DURATION);
    } catch (error: any) {
      if (disposed || sequence !== current) return;
      fail(
        error?.name === "NotAllowedError"
          ? "Microphone refusé. Autorisez-le dans le navigateur ou joignez un fichier audio."
          : error?.message || "Enregistrement impossible.",
      );
    }
  };

  cancel.onclick = () => {
    reset();
    trigger.focus();
  };
  stop.onclick = () => {
    if (state === "recording" && recorder?.state === "recording") {
      stop.disabled = true;
      recorder.stop();
    }
  };
  send.onclick = async () => {
    if (state !== "ready" || !clip) return;
    if (!navigator.onLine) {
      status.textContent =
        "Connexion nécessaire. Le vocal reste disponible ici.";
      report("Connexion nécessaire pour envoyer le vocal.");
      return;
    }
    state = "sending";
    bar.classList.add("is-sending");
    status.textContent = "Chiffrement et envoi en cours…";
    cancel.disabled = true;
    send.disabled = true;
    try {
      await upload(clip, { duration });
      if (!disposed) {
        reset();
        report("Message vocal chiffré envoyé.");
        trigger.focus();
      }
    } catch (error: any) {
      if (disposed) return;
      state = "ready";
      bar.classList.remove("is-sending");
      status.textContent = "Envoi impossible. Le vocal reste disponible ici.";
      cancel.disabled = false;
      send.disabled = false;
      report(error?.message || "Envoi du vocal impossible.");
    }
  };

  return {
    start,
    dispose() {
      if (disposed) return false;
      const discarded = state !== "idle";
      disposed = true;
      reset();
      bar.remove();
      return discarded;
    },
  };
}

function formatTime(milliseconds: number) {
  const seconds = Math.min(120, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
