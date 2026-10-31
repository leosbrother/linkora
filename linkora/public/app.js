const form = document.querySelector('#link-form');
const input = document.querySelector('#destination');
const button = document.querySelector('#submit-button');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const shortUrl = document.querySelector('#short-url');
const qrImage = document.querySelector('#qr-image');
const download = document.querySelector('#download-qr');

form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  button.disabled = true;
  button.innerHTML = 'Creo il tuo link… <span aria-hidden="true">✦</span>';
  try {
    const response = await fetch('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination: input.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Non riesco a creare il link. Riprova.');
    shortUrl.href = data.shortUrl;
    shortUrl.textContent = data.shortUrl;
    qrImage.src = data.qr;
    download.href = data.qr;
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { error.textContent = e.message || 'Si è verificato un problema. Riprova.'; error.hidden = false; }
  finally { button.disabled = false; button.innerHTML = 'Crea il mio link <span aria-hidden="true">↗</span>'; }
});

document.querySelector('#copy').addEventListener('click', async event => {
  try { await navigator.clipboard.writeText(shortUrl.href); }
  catch { const range = document.createRange(); range.selectNode(shortUrl); getSelection().removeAllRanges(); getSelection().addRange(range); }
  const copy = event.currentTarget;
  copy.innerHTML = '<span>✓</span> Copiato';
  document.querySelector('#copied').textContent = 'Link copiato negli appunti';
  setTimeout(() => { copy.innerHTML = '<span>▢</span> Copia'; document.querySelector('#copied').textContent = ''; }, 2200);
});
document.querySelector('#reset').addEventListener('click', () => { result.hidden = true; input.value = ''; input.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
