export type Role = "owner" | "admin" | "member";
export type GroupAction = "editSettings" | "addMember" | "invite" | "pin" | "removeMember" | "setRole" | "transferOwner" | "deleteGroup" | "leave" | "deleteOthersMessages";
const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

/**
 * Single source of truth for group permissions; used by the API (authoritative) and the UI (to hide controls).
 * `target` is required for removeMember / setRole / transferOwner.
 */
export function can(actor: Role, action: GroupAction, target?: Role, opts: { onlyMember?: boolean } = {}): boolean {
  switch (action) {
    case "editSettings": case "addMember": case "invite": case "pin": case "deleteOthersMessages": return RANK[actor] >= RANK.admin;
    case "removeMember": return !!target && target !== "owner" && RANK[actor] > RANK[target];   // admins remove members; owner removes anyone else
    case "setRole": return actor === "owner" && !!target && target !== "owner";
    case "transferOwner": return actor === "owner" && !!target && target !== "owner";
    case "deleteGroup": return actor === "owner";
    case "leave": return actor !== "owner" || !!opts.onlyMember;                                // an owner must hand over (or be alone) before leaving
  }
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };
