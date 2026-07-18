/* Configuration du back-office Franchisé (front). */
window.FB_CONFIG = {
  role: 'franchisee',                                  // guard côté API : /bo/franchisee/*
  appUrl: 'back_office_ws_franchisee.dc.html',
  // Base de l'API Franchise Buddy. '' = même origine (/bo/...).
  // Déploiement conseillé : SPA et API sur le MÊME site (sous-domaines d'un même
  // domaine) pour que le cookie SameSite=Lax circule. Surcharge possible en test
  // via ?api=http://127.0.0.1:8080 ou localStorage.FB_API_BASE.
  apiBase: '',
};
