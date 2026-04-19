export type CurrentKind = "PHOTO" | "VIDEO" | null;

export type EditMethodInput = {
  currentKind: CurrentKind;
  nextText: string;
  nextMedia: boolean;
  removeMedia?: boolean;
};

export type EditMethodOutput =
  | { method: "editMessageText" }
  | { method: "editMessageCaption" }
  | { method: "editMessageMedia" }
  | { method: null; error: "cannot_add_media_to_text" | "cannot_remove_media" };

export function selectEditMethod(input: EditMethodInput): EditMethodOutput {
  const { currentKind, nextMedia, removeMedia } = input;

  if (currentKind === null) {
    if (nextMedia) return { method: null, error: "cannot_add_media_to_text" };
    return { method: "editMessageText" };
  }

  if (removeMedia) return { method: null, error: "cannot_remove_media" };
  if (nextMedia) return { method: "editMessageMedia" };
  return { method: "editMessageCaption" };
}
