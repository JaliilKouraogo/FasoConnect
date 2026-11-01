export type ChatAttachment =
  | {
      kind: "image";
      name: string;
      mime: "image/jpeg" | "image/png" | "image/webp";
      data: string;
    }
  | { kind: "document"; name: string; text: string };

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TEXT_EXTENSIONS = /\.(txt|md|csv|json)$/i;
const PDF_EXTENSION = /\.pdf$/i;
const TEXT_LIMIT = 8000;

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture de l’image impossible."));
    reader.readAsDataURL(file);
  });
}

async function pdfText(file: File): Promise<string> {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  const loading = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  try {
    const pdf = await loading.promise;
    const pages = Math.min(pdf.numPages, 12);
    let text = "";
    for (
      let number = 1;
      number <= pages && text.length < TEXT_LIMIT;
      number++
    ) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
      text += `\nPage ${number} : ${line}`;
      page.cleanup();
    }
    text = text.trim();
    if (!text.replace(/Page \d+ :/g, "").trim())
      throw new Error(
        "Ce PDF ne contient pas de texte lisible. Joignez plutôt une image de la page.",
      );
    const note =
      pdf.numPages > pages
        ? `Extrait des ${pages} premières pages sur ${pdf.numPages}.\n`
        : "";
    return (note + text).slice(0, TEXT_LIMIT);
  } finally {
    await loading.destroy();
  }
}

export async function prepareChatAttachment(
  file: File,
): Promise<ChatAttachment> {
  const name = file.name.slice(0, 120).trim() || "Fichier";
  if (IMAGE_TYPES.has(file.type)) {
    if (file.size > 2 * 1024 * 1024)
      throw new Error("Image trop volumineuse : 2 Mo maximum.");
    const dataUrl = await fileAsDataUrl(file);
    const data = dataUrl.split(",", 2)[1];
    if (!data) throw new Error("Image illisible.");
    return {
      kind: "image",
      name,
      mime: file.type as "image/jpeg" | "image/png" | "image/webp",
      data,
    };
  }
  if (PDF_EXTENSION.test(name)) {
    if (file.size > 5 * 1024 * 1024)
      throw new Error("PDF trop volumineux : 5 Mo maximum.");
    try {
      return { kind: "document", name, text: await pdfText(file) };
    } catch (error: any) {
      if (error?.message?.startsWith("Ce PDF ne contient pas")) throw error;
      throw new Error("PDF illisible ou protégé par un mot de passe.");
    }
  }
  if (TEXT_EXTENSIONS.test(name)) {
    if (file.size > 256 * 1024)
      throw new Error("Document texte trop volumineux : 256 Ko maximum.");
    const text = new TextDecoder("utf-8", { fatal: true })
      .decode(await file.arrayBuffer())
      .trim();
    if (!text) throw new Error("Le document est vide.");
    return {
      kind: "document",
      name,
      text:
        text.length > TEXT_LIMIT
          ? text.slice(0, 7950) + "\n[Extrait limité aux premiers caractères.]"
          : text,
    };
  }
  throw new Error(
    "Format non pris en charge. Choisissez JPG, PNG, WebP, PDF, TXT, MD, CSV ou JSON.",
  );
}
