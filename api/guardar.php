<?php
/**
 * api/guardar.php  (POST multipart/form-data)
 * Crea un documento (sin id_documento) o lo actualiza (con id_documento).
 * Campos: no_oficio, fecha, asunto, remitente, destinatario, estatus, archivo (PDF)
 * El PDF se guarda en la tabla archivos_pdf (la nube no tiene disco persistente).
 */
require __DIR__ . '/../conexion.php';
exigirMetodo('POST');

$id           = (int)($_POST['id_documento'] ?? 0);
$noOficio     = trim($_POST['no_oficio'] ?? '');
$fecha        = trim($_POST['fecha'] ?? '');
$asunto       = trim($_POST['asunto'] ?? '');
$remitente    = trim($_POST['remitente'] ?? '');
$destinatario = trim($_POST['destinatario'] ?? '');
$estatus      = trim($_POST['estatus'] ?? '');
$esNuevo      = ($id === 0);

// ---------- Validación de datos (siempre en servidor) ----------
$errores = [];
if ($noOficio === '' || mb_strlen($noOficio) > 50)         $errores[] = 'El No. de oficio es obligatorio (máx. 50 caracteres).';
$d = DateTime::createFromFormat('Y-m-d', $fecha);
if (!$d || $d->format('Y-m-d') !== $fecha)                 $errores[] = 'La fecha no es válida.';
if ($asunto === '' || mb_strlen($asunto) > 255)            $errores[] = 'El asunto es obligatorio (máx. 255 caracteres).';
if ($remitente === '' || mb_strlen($remitente) > 150)      $errores[] = 'El remitente es obligatorio (máx. 150 caracteres).';
if ($destinatario === '' || mb_strlen($destinatario) > 150) $errores[] = 'El destinatario es obligatorio (máx. 150 caracteres).';
if (!in_array($estatus, ESTATUS_VALIDOS, true))            $errores[] = 'El estatus no es válido.';

// ---------- Validación del archivo PDF ----------
$hayArchivo = isset($_FILES['archivo']) && $_FILES['archivo']['error'] !== UPLOAD_ERR_NO_FILE;
$contenido  = null;
$nombrePdf  = null;

if ($hayArchivo) {
    $f = $_FILES['archivo'];
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) {
        $errores[] = 'El archivo supera el tamaño permitido por el servidor (máx. 4 MB).';
    } elseif ($f['error'] !== UPLOAD_ERR_OK) {
        $errores[] = 'No se pudo recibir el archivo (código ' . $f['error'] . ').';
    } elseif ($f['size'] > MAX_BYTES) {
        $errores[] = 'El PDF no debe pesar más de 4 MB.';
    } else {
        $contenido = file_get_contents($f['tmp_name']);
        // Firma real del PDF + tipo MIME (si la extensión fileinfo está disponible)
        $esPdf = $contenido !== false && substr($contenido, 0, 5) === '%PDF-';
        if ($esPdf && class_exists('finfo')) {
            $esPdf = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) === 'application/pdf';
        }
        if (!$esPdf) {
            $errores[] = 'El archivo no es un PDF válido.';
            $contenido = null;
        } else {
            // Nombre aleatorio de referencia (se guarda en documentos.archivo_pdf)
            $nombrePdf = bin2hex(random_bytes(16)) . '.pdf';
        }
    }
} elseif ($esNuevo) {
    $errores[] = 'Debes adjuntar el documento digitalizado (foto o PDF).';
}

if ($errores) {
    responder(['ok' => false, 'error' => implode(' ', $errores)], 422);
}

$db = conectaDB();
$db->begin_transaction();

if ($esNuevo) {
    $stmt = $db->prepare(
        'INSERT INTO documentos (no_oficio, fecha, asunto, remitente, destinatario, estatus, archivo_pdf)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->bind_param('sssssss', $noOficio, $fecha, $asunto, $remitente, $destinatario, $estatus, $nombrePdf);
} else {
    $chk = $db->prepare('SELECT 1 FROM documentos WHERE id_documento = ?');
    $chk->bind_param('i', $id);
    $chk->execute();
    $chk->store_result();
    $existe = $chk->num_rows > 0;
    $chk->close();
    if (!$existe) {
        $db->rollback();
        responder(['ok' => false, 'error' => 'El documento no existe.'], 404);
    }

    if ($nombrePdf) {
        $stmt = $db->prepare(
            'UPDATE documentos SET no_oficio=?, fecha=?, asunto=?, remitente=?, destinatario=?, estatus=?, archivo_pdf=?
             WHERE id_documento=?'
        );
        $stmt->bind_param('sssssssi', $noOficio, $fecha, $asunto, $remitente, $destinatario, $estatus, $nombrePdf, $id);
    } else {
        $stmt = $db->prepare(
            'UPDATE documentos SET no_oficio=?, fecha=?, asunto=?, remitente=?, destinatario=?, estatus=?
             WHERE id_documento=?'
        );
        $stmt->bind_param('ssssssi', $noOficio, $fecha, $asunto, $remitente, $destinatario, $estatus, $id);
    }
}

if (!$stmt->execute()) {
    $duplicado = ($stmt->errno === 1062);
    $db->rollback();
    responder([
        'ok'    => false,
        'error' => $duplicado ? 'Ya existe un documento con ese No. de oficio.' : 'No se pudo guardar el documento.',
    ], $duplicado ? 409 : 500);
}

$idFinal = $esNuevo ? $stmt->insert_id : $id;
$stmt->close();

// Guardar (o reemplazar) el contenido del PDF
if ($contenido !== null) {
    $pdf = $db->prepare(
        'INSERT INTO archivos_pdf (id_documento, contenido) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE contenido = VALUES(contenido)'
    );
    $nulo = null;
    $pdf->bind_param('ib', $idFinal, $nulo);
    $pdf->send_long_data(1, $contenido);
    if (!$pdf->execute()) {
        $db->rollback();
        responder(['ok' => false, 'error' => 'No se pudo guardar el PDF en la base de datos.'], 500);
    }
    $pdf->close();
}

$db->commit();
$db->close();

responder(['ok' => true, 'id_documento' => (int)$idFinal, 'mensaje' => $esNuevo ? 'Documento registrado.' : 'Documento actualizado.']);
