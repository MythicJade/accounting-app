// Return links are same-app routes only; query state also survives an actual reload.
export function safeReturnRoute(value, fallback = '#/') {
  return typeof value === 'string' && /^#\/(?:\?|$|transactions(?:\?|$)|stats(?:\/category\/[^/?#]+)?(?:\?|$)|accounts(?:\/[^/?#]+(?:\/transactions)?)?(?:\?|$)|transaction\/\d+(?:\?|$))/.test(value)
    ? value : fallback;
}

export function contextualRoute(path, origin = location.hash || '#/') {
  const [base, search = ''] = path.split('?');
  const query = new URLSearchParams(search);
  query.set('return', safeReturnRoute(origin));
  return base + '?' + query;
}

export function openTransaction(id) {
  location.hash = contextualRoute('#/transaction/' + id);
}
