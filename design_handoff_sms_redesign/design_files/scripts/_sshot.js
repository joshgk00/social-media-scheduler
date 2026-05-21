// Screenshot helpers — injected per capture step.
// Apply once and the iframe stays in "screenshot mode" (1440×900 scaled to fit).

window.__sshotSetup = () => {
  const W = 1440, H = 900;
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  document.documentElement.style.cssText = 'width:' + W + 'px;height:' + H + 'px;overflow:hidden;';
  document.body.style.cssText = 'width:' + W + 'px;height:' + H + 'px;overflow:hidden;transform-origin:top left;transform:scale(' + scale + ');';
  document.querySelectorAll('[data-screenshot-hide]').forEach(el => el.style.display = 'none');
};

window.__sshotClickByText = (text, tag = 'button') => {
  const el = [...document.querySelectorAll(tag)].find(b => b.textContent.trim() === text);
  if (el) el.click();
  return !!el;
};

window.__sshotClickIn = (containerSelector, text, tag = 'button') => {
  const c = document.querySelector(containerSelector);
  if (!c) return false;
  const el = [...c.querySelectorAll(tag)].find(b => b.textContent.trim() === text);
  if (el) el.click();
  return !!el;
};
