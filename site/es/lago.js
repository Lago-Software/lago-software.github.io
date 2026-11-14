// Adresse qui reçoit les demandes de démo : la renseigner ici active le formulaire.
var LAGO_CONTACT_EMAIL = 'lago.software.contact@gmail.com';
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a.zoom');
  if (!a || !window.HTMLDialogElement || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  var img = a.querySelector('img');
  var d = document.createElement('dialog');
  d.className = 'lb';
  d.setAttribute('aria-label', img ? img.alt : 'Captura ampliada');
  d.innerHTML = '<button type="button" aria-label="Fermer">×</button><img alt=""><p></p>';
  d.querySelector('img').src = a.getAttribute('href');
  d.querySelector('img').alt = img ? img.alt : '';
  d.querySelector('p').textContent = (img ? img.alt + ' · ' : '') + 'Captura real, datos de demostración';
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
  if (!g('nom') || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g('email'))) { say('Indique su nombre y una dirección de e-mail válida.'); return; }
  if (!LAGO_CONTACT_EMAIL) { say('Las solicitudes online se abrirán muy pronto. ¡Gracias por su interés!'); return; }
  var body = 'Nombre: ' + g('nom') + '\nEstablecimiento: ' + (g('etablissement') || '-') + '\nE-mail: ' + g('email') +
    '\nTeléfono: ' + (g('telephone') || '-') + '\nSector: ' + g('activite') + '\n\n' + g('message');
  location.href = 'mailto:' + LAGO_CONTACT_EMAIL + '?subject=' + encodeURIComponent('Solicitud de demo de Lago') + '&body=' + encodeURIComponent(body);
  say('Su programa de correo se abre con la solicitud ya rellenada: solo queda enviarla.', true);
});
