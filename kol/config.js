/* Where the data lives: the KOL Apps Script web app's /exec URL (Deploy > Manage deployments). Not a secret:
   every call also needs the key, which is never in this repo.
   keyStore: this site shares the github.io origin with the Posting site, so its key is kept under its own name. */
window.PW_CONFIG = {
  api: 'https://script.google.com/macros/s/AKfycbwUdwdnk5dVwgfNWYH6fE6rC-uyEDF7DJpm8k8Y7_DC3jLxHV7M_TUXg6f7DYS3XGl_/exec',
  keyStore: 'pwkol_k',
  keyMenu: 'Pin Wei KOL &gt; Open KOL site',
};
