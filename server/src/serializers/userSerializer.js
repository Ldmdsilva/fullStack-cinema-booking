/**
 * Serialize a User document (or plain object) into the public API shape.
 * @param {object} user
 * @returns {object}
 */
export function serializeUser(user) {
  if (!user) return null;
  const obj = typeof user.toJSON === 'function' ? user.toJSON() : user;

  return {
    id: (obj.id ?? obj._id)?.toString(),
    name: obj.name,
    email: obj.email,
    phone: obj.phone,
    role: obj.role,
    emailVerified: obj.emailVerified,
    createdAt: obj.createdAt,
  };
}
