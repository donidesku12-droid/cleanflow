export const PLANS = [
  {
    id: 'starter', name: 'Starter', price: 19,
    tagline: 'For solo cleaners and small teams getting organised.',
    features: ['Business dashboard', 'Customer management', 'Booking management', 'Online booking page', 'Basic analytics', 'Up to 2 user accounts'],
  },
  {
    id: 'professional', name: 'Professional', price: 39, popular: true,
    tagline: 'For growing companies with a team in the field.',
    features: ['Everything in Starter', 'AI customer support assistant', 'Employee management & scheduling', 'Advanced analytics', 'Automated email & SMS notifications', 'Up to 15 user accounts'],
  },
  {
    id: 'business', name: 'Business', price: 69,
    tagline: 'For established companies that need more control.',
    features: ['Everything in Professional', 'Advanced business management', 'Custom branding (your logo)', 'Advanced reporting & CSV exports', 'Priority support', 'Up to 100 user accounts'],
  },
];

export const FEATURE_LABELS = {
  ai_assistant: 'AI assistant', employees: 'Employee management', advanced_analytics: 'Advanced analytics',
  automated_notifications: 'Automated notifications', advanced_reporting: 'Advanced reporting', custom_branding: 'Custom branding',
};
