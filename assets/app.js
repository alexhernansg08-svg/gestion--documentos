/**
 * app.js — Lógica del frontend (conectada a la API PHP/MySQL)
 * Secciones: 1) Utilidades  2) Vistas (modal / móvil)  3) Listado y filtros
 *            4) Digitalización (foto/PDF)  5) Guardar / editar / estatus / eliminar  6) Visor de PDF
 */

/* ==================== 1) UTILIDADES ==================== */
const API = 'api/';
const MAX_BYTES = 4 * 1024 * 1024;            // 4 MB (límite de Vercel: 4.5 MB por petición)
let modoEdicion = false;                       // true cuando el formulario edita un documento
let archivoSeleccionado = null;                // File (PDF) listo para enviarse
let paginaActual = 1;
let cacheDocs = {};                            // id -> documento (para editar / ver)
let temporizador = null;

const ESTATUS = ['Recibido', 'En proceso', 'Atendido'];
const COLORES = {
  'Recibido':   'bg-emerald-100 text-emerald-800 border-emerald-200',
  'En proceso': 'bg-amber-100 text-amber-800 border-amber-300',
  'Atendido':   'bg-blue-100 text-blue-800 border-blue-200'
};

/** Escapa texto para insertarlo de forma segura en HTML (evita XSS). */
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/** AAAA-MM-DD -> DD/MM/AAAA */
function formatoFecha(f) {
  const p = String(f).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f;
}

/** Llama a la API y devuelve el JSON (o lanza un Error con mensaje legible). */
async function llamarAPI(url, opciones) {
  let resp, texto;
  try {
    resp = await fetch(url, opciones);
    texto = await resp.text();
  } catch (e) {
    throw new Error('No se pudo conectar con el servidor. ¿Está Apache encendido?');
  }
  let datos;
  try { datos = JSON.parse(texto); }
  catch (e) { throw new Error('El servidor devolvió una respuesta inesperada. Revisa conexion.php y los logs de PHP.'); }
  if (!resp.ok || datos.ok === false) throw new Error(datos.error || 'Error del servidor.');
  return datos;
}

/* ==================== 2) VISTAS (modal / móvil) ==================== */
// Switch between Mobile List view and Mobile Register View
    function switchMobileView(view) {
      const listView = document.getElementById('listViewSection');
      const mobileRegView = document.getElementById('mobileRegisterSection');
      const tabList = document.getElementById('mobileTabBtnList');
      const tabReg = document.getElementById('mobileTabBtnReg');
      const modal = document.getElementById('registrationModal');

      if (view === 'register') {
        // Hide list, show form inline for mobile
        listView.classList.add('hidden');
        mobileRegView.classList.remove('hidden');
        
        // Move form into mobile container if needed
        const formCard = document.getElementById('modalCard');
        document.getElementById('mobileFormPlaceholder').appendChild(formCard);
        modal.classList.add('hidden'); // ensure background overlay is hidden

        // Update tabs styling
        tabReg.classList.add('border-cbtis-wine', 'text-cbtis-wine');
        tabReg.classList.remove('border-transparent', 'text-slate-500');
        tabList.classList.remove('border-cbtis-wine', 'text-cbtis-wine');
        tabList.classList.add('border-transparent', 'text-slate-500');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        if (modoEdicion) resetFormulario();
        // Show table list
        listView.classList.remove('hidden');
        mobileRegView.classList.add('hidden');

        // Restore modal card to modal overlay for desktop usage
        const formCard = document.getElementById('modalCard');
        document.getElementById('registrationModal').appendChild(formCard);

        // Update tabs styling
        tabList.classList.add('border-cbtis-wine', 'text-cbtis-wine');
        tabList.classList.remove('border-transparent', 'text-slate-500');
        tabReg.classList.remove('border-cbtis-wine', 'text-cbtis-wine');
        tabReg.classList.add('border-transparent', 'text-slate-500');
      }
    }

    // Modal Handlers for Desktop
    function openRegistrationModal() {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        switchMobileView('register');
      } else {
        const modal = document.getElementById('registrationModal');
        const formCard = document.getElementById('modalCard');
        modal.appendChild(formCard);
        modal.classList.remove('hidden');
      }
    }

    function openRegistrationFromBottomNav() {
      openRegistrationModal();
    }

    function closeRegistrationModal() {
      const modal = document.getElementById('registrationModal');
      modal.classList.add('hidden');
      if (modoEdicion) resetFormulario();
    }

    // Close modal on click outside (for desktop)
    window.addEventListener('click', (e) => {
      const modal = document.getElementById('registrationModal');
      if (e.target === modal) {
        closeRegistrationModal();
      }
    });

    
function focusSearchMobile() {
      switchMobileView('list');
      const input = document.getElementById('searchInput');
      if (input) {
        input.focus();
      }
    }

/* ==================== 3) LISTADO Y FILTROS ==================== */
function buscarConRetraso() {                  // espera 300 ms tras dejar de escribir
  clearTimeout(temporizador);
  temporizador = setTimeout(() => cargarDocumentos(1), 300);
}

async function cargarDocumentos(pagina = paginaActual) {
  const tbody = document.getElementById('tableBody');
  const p = new URLSearchParams({
    q: document.getElementById('searchInput').value.trim(),
    estatus: document.getElementById('filterStatus').value === 'Todos' ? '' : document.getElementById('filterStatus').value,
    desde: document.getElementById('filterFrom').value,
    hasta: document.getElementById('filterTo').value,
    pagina: pagina
  });
  try {
    const r = await llamarAPI(API + 'listar.php?' + p.toString());
    paginaActual = r.pagina;
    cacheDocs = {};
    r.documentos.forEach(d => cacheDocs[d.id_documento] = d);
    pintarTabla(r.documentos);
    pintarPaginacion(r);
    document.getElementById('contadorTotal').textContent = r.total_general;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-red-600 text-sm">${esc(e.message)}</td></tr>`;
    document.getElementById('infoRegistros').textContent = '';
    document.getElementById('paginacion').innerHTML = '';
  }
}

const ICONO_VER = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';
const ICONO_DESCARGAR = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>';
const ICONO_EDITAR = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.768-6.768a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-.879.513L7 17l.659-3.949A2 2 0 018.172 12.17L9 13z"/></svg>';
const ICONO_BORRAR = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';

function pintarTabla(docs) {
  const tbody = document.getElementById('tableBody');
  if (!docs.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-10 text-center text-slate-400 text-sm">No se encontraron documentos.</td></tr>';
    return;
  }
  tbody.innerHTML = docs.map(d => {
    const id = Number(d.id_documento);
    const opciones = ESTATUS.map(e => `<option value="${e}"${e === d.estatus ? ' selected' : ''}>${e}</option>`).join('');
    const btnPdf = d.tiene_pdf
      ? `<button type="button" onclick="verDocumento(${id})" title="Ver PDF" class="p-1 hover:text-cbtis-wine hover:bg-slate-100 rounded">${ICONO_VER}</button>
         <a href="${API}archivo.php?id=${id}&descargar=1" title="Descargar PDF" class="p-1 hover:text-cbtis-wine hover:bg-slate-100 rounded">${ICONO_DESCARGAR}</a>`
      : `<span class="p-1 text-slate-300 cursor-not-allowed" title="Sin PDF disponible">${ICONO_VER}</span>
         <span class="p-1 text-slate-300 cursor-not-allowed" title="Sin PDF disponible">${ICONO_DESCARGAR}</span>`;
    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3.5 font-bold text-cbtis-wine whitespace-nowrap">${esc(d.no_oficio)}</td>
        <td class="py-3 px-3.5 text-slate-500 whitespace-nowrap">${esc(formatoFecha(d.fecha))}</td>
        <td class="py-3 px-3.5 font-medium text-slate-800 max-w-xs truncate" title="${esc(d.asunto)}">${esc(d.asunto)}</td>
        <td class="py-3 px-3.5 text-slate-600">${esc(d.remitente)}</td>
        <td class="py-3 px-3.5 text-slate-600">${esc(d.destinatario)}</td>
        <td class="py-3 px-3.5 text-center">
          <select aria-label="Cambiar estatus" onchange="cambiarEstatus(${id}, this)"
                  class="text-[11px] font-bold rounded-full border py-0.5 pl-2.5 pr-7 cursor-pointer ${COLORES[d.estatus] || ''}">${opciones}</select>
        </td>
        <td class="py-3 px-3.5 text-center whitespace-nowrap">
          <div class="inline-flex items-center gap-1.5 text-slate-500">
            ${btnPdf}
            <button type="button" onclick="editarDocumento(${id})" title="Editar" class="p-1 hover:text-cbtis-wine hover:bg-slate-100 rounded">${ICONO_EDITAR}</button>
            <button type="button" onclick="eliminarDocumento(${id})" title="Eliminar" class="p-1 hover:text-red-600 hover:bg-slate-100 rounded">${ICONO_BORRAR}</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function pintarPaginacion(r) {
  const info = document.getElementById('infoRegistros');
  const cont = document.getElementById('paginacion');
  if (r.total === 0) { info.textContent = 'Mostrando 0 registros'; cont.innerHTML = ''; return; }
  const ini = (r.pagina - 1) * r.por_pagina + 1;
  const fin = Math.min(r.pagina * r.por_pagina, r.total);
  info.innerHTML = `Mostrando <span class="font-bold text-slate-700">${ini}</span> a <span class="font-bold text-slate-700">${fin}</span> de <span class="font-bold text-slate-700">${r.total}</span> registros`;

  const base = 'px-3 py-1.5 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50';
  const btn = (txt, pag, dis, activo) =>
    `<button type="button" class="${activo ? 'px-3 py-1.5 bg-cbtis-wine text-white font-bold' : base}" ${dis ? 'disabled' : ''} onclick="cargarDocumentos(${pag})">${txt}</button>`;
  let html = btn('«', 1, r.pagina === 1) + btn('‹', r.pagina - 1, r.pagina === 1);
  const desde = Math.max(1, r.pagina - 2), hasta = Math.min(r.paginas, r.pagina + 2);
  for (let i = desde; i <= hasta; i++) html += btn(i, i, false, i === r.pagina);
  html += btn('›', r.pagina + 1, r.pagina === r.paginas) + btn('»', r.paginas, r.pagina === r.paginas);
  cont.innerHTML = html;
}

/* ==================== 4) DIGITALIZACIÓN (foto o PDF) ==================== */
/** Se ejecuta al tomar una foto o elegir un archivo. Las imágenes se convierten a PDF. */
async function handleFileUpload(event, tipo) {
  const archivo = event.target.files[0];
  if (!archivo) return;
  try {
    let pdf;
    if (archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)) {
      pdf = archivo;
    } else if (archivo.type.startsWith('image/')) {
      pdf = await imagenAPdf(archivo);
    } else {
      throw new Error('Selecciona un PDF o una imagen.');
    }
    if (pdf.size > MAX_BYTES) throw new Error('El archivo no debe pesar más de 4 MB.');
    archivoSeleccionado = pdf;
    document.getElementById('filePreviewContainer').classList.remove('hidden');
    document.getElementById('previewFileName').textContent = pdf.name;
    document.getElementById('previewFileSize').textContent = (pdf.size / 1024).toFixed(1) + ' KB - PDF listo para guardar';
  } catch (e) {
    alert(e.message);
    removeAttachedFile();
  }
}

function removeAttachedFile() {
  archivoSeleccionado = null;
  document.getElementById('cameraInput').value = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('filePreviewContainer').classList.add('hidden');
}

/** Convierte una foto en un PDF (una página A4) usando jsPDF; reduce el tamaño de la imagen. */
async function imagenAPdf(archivo) {
  if (!window.jspdf) throw new Error('No se cargó la librería jsPDF (se necesita internet). Selecciona un PDF directamente.');
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, fallo) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fallo(new Error('No se pudo leer la imagen.'));
      i.src = url;
    });
    const escala = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * escala), h = Math.round(img.naturalHeight * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const datos = canvas.toDataURL('image/jpeg', 0.8);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: w > h ? 'l' : 'p', unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const r = Math.min(pw / w, ph / h);
    pdf.addImage(datos, 'JPEG', (pw - w * r) / 2, (ph - h * r) / 2, w * r, h * r);
    const nombre = 'Documento_' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '') + '.pdf';
    return new File([pdf.output('blob')], nombre, { type: 'application/pdf' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ==================== 5) GUARDAR / EDITAR / ESTATUS / ELIMINAR ==================== */
function resetFormulario() {
  document.getElementById('documentForm').reset();
  document.getElementById('docId').value = '';
  document.getElementById('docDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('formTitle').textContent = 'Registrar Documento';
  document.getElementById('btnGuardarTexto').textContent = 'Guardar Documento';
  removeAttachedFile();
  modoEdicion = false;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const editando = document.getElementById('docId').value !== '';
  if (!editando && !archivoSeleccionado) {
    alert('Adjunta el documento digitalizado: toma una foto o selecciona un archivo.');
    return;
  }
  const fd = new FormData();
  fd.append('id_documento', document.getElementById('docId').value);
  fd.append('no_oficio', document.getElementById('docNumber').value.trim());
  fd.append('fecha', document.getElementById('docDate').value);
  fd.append('asunto', document.getElementById('docSubject').value.trim());
  fd.append('remitente', document.getElementById('docSender').value.trim());
  fd.append('destinatario', document.getElementById('docRecipient').value.trim());
  fd.append('estatus', document.getElementById('docStatus').value);
  if (archivoSeleccionado) fd.append('archivo', archivoSeleccionado, archivoSeleccionado.name);

  const boton = document.getElementById('btnGuardar');
  boton.disabled = true;
  try {
    const r = await llamarAPI(API + 'guardar.php', { method: 'POST', body: fd });
    resetFormulario();
    closeRegistrationModal();
    switchMobileView('list');
    await cargarDocumentos(editando ? paginaActual : 1);
    alert(r.mensaje || 'Guardado correctamente.');
  } catch (err) {
    alert(err.message);
  } finally {
    boton.disabled = false;
  }
}

function editarDocumento(id) {
  const d = cacheDocs[id];
  if (!d) return;
  openRegistrationModal();
  document.getElementById('docId').value = d.id_documento;
  document.getElementById('docNumber').value = d.no_oficio;
  document.getElementById('docDate').value = d.fecha;
  document.getElementById('docSubject').value = d.asunto;
  document.getElementById('docSender').value = d.remitente;
  document.getElementById('docRecipient').value = d.destinatario;
  document.getElementById('docStatus').value = d.estatus;
  document.getElementById('formTitle').textContent = 'Editar Documento';
  document.getElementById('btnGuardarTexto').textContent = 'Guardar Cambios';
  removeAttachedFile();               // el PDF es opcional al editar (si no se adjunta, se conserva el actual)
  modoEdicion = true;
}

async function cambiarEstatus(id, select) {
  const nuevo = select.value;
  const anterior = cacheDocs[id] ? cacheDocs[id].estatus : null;
  const fd = new FormData();
  fd.append('id_documento', id);
  fd.append('estatus', nuevo);
  try {
    await llamarAPI(API + 'actualizar_estatus.php', { method: 'POST', body: fd });
    if (cacheDocs[id]) cacheDocs[id].estatus = nuevo;
    select.className = select.className.replace(/bg-\S+|text-(emerald|amber|blue)-\S+|border-(emerald|amber|blue)-\S+/g, '').trim() + ' ' + COLORES[nuevo];
  } catch (err) {
    alert(err.message);
    if (anterior) select.value = anterior;
  }
}

async function eliminarDocumento(id) {
  const d = cacheDocs[id];
  if (!confirm(`¿Eliminar el oficio ${d ? d.no_oficio : ''}? Esta acción no se puede deshacer.`)) return;
  const fd = new FormData();
  fd.append('id_documento', id);
  try {
    await llamarAPI(API + 'eliminar.php', { method: 'POST', body: fd });
    await cargarDocumentos(paginaActual);
  } catch (err) {
    alert(err.message);
  }
}

/* ==================== 6) VISOR DE PDF ==================== */
function verDocumento(id) {
  const d = cacheDocs[id];
  document.getElementById('viewerTitle').textContent = `Oficio No. ${d ? d.no_oficio : id}`;
  document.getElementById('pdfFrame').src = `${API}archivo.php?id=${id}`;
  document.getElementById('viewerNewTab').href = `${API}archivo.php?id=${id}`;
  document.getElementById('viewerDownload').href = `${API}archivo.php?id=${id}&descargar=1`;
  document.getElementById('viewerModal').classList.remove('hidden');
}

function closeViewerModal() {
  document.getElementById('viewerModal').classList.add('hidden');
  document.getElementById('pdfFrame').src = 'about:blank';
}

/* ==================== INICIO ==================== */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('docDate').value = new Date().toISOString().split('T')[0];
  cargarDocumentos(1);
});
