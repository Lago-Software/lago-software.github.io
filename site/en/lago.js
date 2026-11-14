// Adresse qui reçoit les demandes de démo : la renseigner ici active le formulaire.
var LAGO_CONTACT_EMAIL = 'lago.software.contact@gmail.com';
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a.zoom');
  if (!a || !window.HTMLDialogElement || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  var img = a.querySelector('img');
  var d = document.createElement('dialog');
  d.className = 'lb';
  d.setAttribute('aria-label', img ? img.alt : 'Enlarged screenshot');
  d.innerHTML = '<button type="button" aria-label="Fermer">×</button><img alt=""><p></p>';
  d.querySelector('img').src = a.getAttribute('href');
  d.querySelector('img').alt = img ? img.alt : '';
  d.querySelector('p').textContent = (img ? img.alt + ' · ' : '') + 'Real screenshot, demo data';
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
  if (!g('nom') || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g('email'))) { say('Please enter your name and a valid email address.'); return; }
  if (!LAGO_CONTACT_EMAIL) { say('Online requests open very soon. Thank you for your interest!'); return; }
  var body = 'Name: ' + g('nom') + '\nBusiness: ' + (g('etablissement') || '-') + '\nEmail: ' + g('email') +
    '\nPhone: ' + (g('telephone') || '-') + '\nIndustry: ' + g('activite') + '\n\n' + g('message');
  location.href = 'mailto:' + LAGO_CONTACT_EMAIL + '?subject=' + encodeURIComponent('Lago demo request') + '&body=' + encodeURIComponent(body);
  say('Your email app opens with the request pre-filled: all that’s left is to send it.', true);
});
