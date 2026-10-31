export const state = {
  currentMedia: null, batchMode: false, selectMode: false,
  visibleIds: [], selected: new Set(), lastClipboard: "",
  deferredPrompt: null, selectedPhotos: new Set(), settings: null, history: []
};

export function updateFavoriteButton() {
  const button = document.getElementById("favoriteCurrent");
  if (button) {
    button.textContent = state.currentMedia?.favorite ? "★ Hapus favorit" : "☆ Favorit";
  }
}