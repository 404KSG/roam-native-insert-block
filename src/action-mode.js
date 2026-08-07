const resolveActionMode = ({ shiftKey, ctrlKey, metaKey, altKey }) => {
  const activeModifiers = [shiftKey, ctrlKey, metaKey, altKey].filter(Boolean);
  if (activeModifiers.length > 1) return null;
  if (shiftKey) return "delete";
  if (ctrlKey) return "wrap";
  if (metaKey) return "child";
  if (altKey) return "above";
  return "below";
};

module.exports = { resolveActionMode };
