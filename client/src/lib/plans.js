export const PLANS = [
  {
    id: 'starter', name: 'Starter', price: 19,
    tagline: 'Voor zelfstandige schoonmakers en kleine teams die overzicht willen.',
    features: ['Bedrijfsdashboard', 'Klantenbeheer', 'Boekingsbeheer', 'Online boekingspagina', 'Basisanalyses', 'Tot 2 gebruikersaccounts'],
  },
  {
    id: 'professional', name: 'Professional', price: 39, popular: true,
    tagline: 'Voor groeiende bedrijven met een team op pad.',
    features: ['Alles uit Starter', 'AI-klantenservice-assistent', 'Personeelsbeheer & planning', 'Uitgebreide analyses', 'Automatische e-mail- & sms-meldingen', 'Tot 15 gebruikersaccounts'],
  },
  {
    id: 'business', name: 'Business', price: 69,
    tagline: 'Voor gevestigde bedrijven die meer controle willen.',
    features: ['Alles uit Professional', 'Uitgebreid bedrijfsbeheer', 'Eigen huisstijl (je logo)', 'Uitgebreide rapportages & CSV-export', 'Voorrang bij support', 'Tot 100 gebruikersaccounts'],
  },
];

export const FEATURE_LABELS = {
  ai_assistant: 'AI-assistent', employees: 'Personeelsbeheer', advanced_analytics: 'Uitgebreide analyses',
  automated_notifications: 'Automatische meldingen', advanced_reporting: 'Uitgebreide rapportages', custom_branding: 'Eigen huisstijl',
};
