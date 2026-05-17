// Bootstrap admin emails — always treated as admins regardless of staff/{uid} state.
// Keep in sync with isHardcodedAdmin() in firestore.rules.
export const HARDCODED_ADMIN_EMAILS = new Set<string>([
  'tubejaf@gmail.com',
  'fromdotacademy@gmail.com',
  'caremol.in@gmail.com',
]);
