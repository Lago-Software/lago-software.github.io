// Adresse qui reçoit les demandes de démo : la renseigner ici active le formulaire.
var LAGO_CONTACT_EMAIL = 'lago.software.contact@gmail.com';
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a.zoom');
  if (!a || !window.HTMLDialogElement || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  var img = a.querySelector('img');
  var d = document.createElement('dialog');
  d.className = 'lb';
  d.setAttribute('aria-label', img ? img.alt : 'Capture agrandie');
  d.innerHTML = '<button type="button" aria-label="Fermer">×</button><img alt=""><p></p>';
  d.querySelector('img').src = a.getAttribute('href');
  d.querySelector('img').alt = img ? img.alt : '';
  d.querySelector('p').textContent = (img ? img.alt + ' · ' : '') + 'Capture réelle, données de démonstration';
  d.addEventListener('click', function (ev) { if (ev.target === d || ev.target.tagName === 'BUTTON' || ev.target.tagName === 'IMG') d.close(); });
  d.addEventListener('close', function () { d.remove(); a.focus(); });
  document.body.appendChild(d);
  d.showModal();
});
document.addEventListener('submit', function (e) {
  var f = e.target;
  if (!f.matches('form[data-demo]')) return;
  e.preventDefault();
  var g = function (n) { var el = f.elements[n]; return el ? String(el.value || '').trim() : ''; };
  var out = f.querySelector('.msg');
  var say = function (t, ok) { out.textContent = t; out.style.color = ok ? '#166534' : '#9A3412'; };
  if (!g('nom') || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g('email'))) { say('Merci d’indiquer votre nom et une adresse e-mail valide.'); return; }
  if (!LAGO_CONTACT_EMAIL) { say('Les demandes en ligne ouvrent très prochainement. Merci de votre intérêt !'); return; }
  var body = 'Nom : ' + g('nom') + '\nÉtablissement : ' + (g('etablissement') || '-') + '\nE-mail : ' + g('email') +
    '\nTéléphone : ' + (g('telephone') || '-') + '\nActivité : ' + g('activite') + '\n\n' + g('message');
  location.href = 'mailto:' + LAGO_CONTACT_EMAIL + '?subject=' + encodeURIComponent('Demande de démo Lago') + '&body=' + encodeURIComponent(body);
  say('Votre messagerie s’ouvre avec la demande pré-remplie : il ne reste qu’à l’envoyer.', true);
});
