export async function requestPresentationFullscreen(doc: Document) {
  const requestFullscreen = doc.documentElement.requestFullscreen;
  if (!requestFullscreen) {
    return;
  }

  try {
    await requestFullscreen.call(doc.documentElement);
  } catch (error) {
    console.warn("[app-shell] failed to enter fullscreen", error);
  }
}
