interface DisplayUser {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}

export function getUserInitials(user?: DisplayUser): string {
  const nameParts = [user?.firstName, user?.lastName].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts
      .map((part) => part?.[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return (user?.username ?? user?.email ?? "CM").slice(0, 2).toUpperCase();
}

export function getUserDisplayName(user?: DisplayUser): string {
  const fullName = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || user?.username || "Account";
}
