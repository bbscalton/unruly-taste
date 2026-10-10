/* Unruly Taste ordering page: site config.
 * ORDER_WHATSAPP = number that receives orders and that the Call / WhatsApp buttons use. */
window.UT_CONFIG = {
  ORDER_WHATSAPP: '5927129487',            // <-- order line (digits only)
  ORDER_WHATSAPP_DISPLAY: '+592 712 9487', // <-- how that number is shown on the page.
  SITE_URL: 'https://bbscalton.github.io/unruly-taste/', // used in receipts' reorder link
  DEFAULT_COUNTRY_CODE: '592',             // customers' numbers default to Guyana
  TIME_ZONE: 'America/Guyana',
  CURRENCY: 'G$',
  // AI order assistant behind the header "Call" (voice) and "WhatsApp" (text chat) buttons. Public API path only, no keys here.
  // Set to '' to make the two buttons go back to a plain phone call / WhatsApp link.
  ASSISTANT_API: 'https://unruly.neuereatec.org/api/web'
};
