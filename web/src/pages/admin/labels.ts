/** Human wording for the codes the admin API returns. */

const ACTIONS: Record<string, string> = {
  "document.view": "Opened a document",
  "document.approve": "Approved a document",
  "document.reject": "Rejected a document",
  "user.active": "Reinstated a user",
  "user.suspended": "Suspended a user",
  "helper.hide": "Hid a listing",
  "helper.unhide": "Restored a listing",
  "helper.recutout": "Re-ran a photo cutout",
  "subscription.comp": "Gave a free membership",
  "subscription.cancel": "Cancelled a membership",
  "service.create": "Added a category",
  "service.update": "Edited a category",
  "service.archive": "Archived a category",
  "service.restore": "Restored a category",
  "service.reorder": "Reordered categories",
};

export function actionLabel(action: string): string {
  return ACTIONS[action] ?? action;
}

export const DOCUMENT_KIND: Record<string, string> = {
  id_proof: "Government ID",
  address_proof: "Address proof",
  police_verification: "Police clearance",
  photo: "Photo",
};

export const ROLE_LABEL: Record<string, string> = {
  hirer: "Family",
  helper: "Helper",
  admin: "Admin",
};
