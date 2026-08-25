/**
 * Serialize a Film document into its public shape. Films are pure
 * catalogue metadata (no seats/availability concept like Event), so a
 * single serializer covers both list and detail use — there is no
 * summary/detail split need here (unlike `eventSerializer`).
 * @param {object} film
 * @returns {object}
 */
export function serializeFilm(film) {
  if (!film) return null;
  const obj = typeof film.toJSON === 'function' ? film.toJSON() : film;

  return {
    id: (obj.id ?? obj._id)?.toString(),
    title: obj.title,
    synopsis: obj.synopsis,
    certificate: obj.certificate,
    runtimeMinutes: obj.runtimeMinutes,
    genre: obj.genre,
    posterUrl: obj.posterUrl,
    releaseDate: obj.releaseDate,
    createdAt: obj.createdAt,
  };
}
