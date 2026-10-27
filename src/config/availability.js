// Functional testing release. Paid top-ups stay off until configured and approved.
// Keep a complete address out of static HTML and source literals; contact opens only on click.
export const CONTACT_EMAIL=['info',['mibatute','com'].join('.')].join('@');
export const PAID_TOPUPS_ENABLED=false;
export const REGISTRATION_ENABLED=true;

// UI opt-in is development-only and never activates paid top-ups in a production build.
export const LOCAL_WOMPI_SANDBOX=import.meta.env?.DEV===true&&import.meta.env?.VITE_WOMPI_SANDBOX==='true';
