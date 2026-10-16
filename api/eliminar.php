<?php
/**
 * api/eliminar.php  (POST)
 * Elimina un documento y su PDF (guardado en archivos_pdf). Campo: id_documento
 */
require __DIR__ . '/../conexion.php';
exigirMetodo('POST');

$id = (int)($_POST['id_documento'] ?? 0);
if ($id <= 0) {
    responder(['ok' => false, 'error' => 'Datos inválidos.'], 422);
}

$db = conectaDB();

$stmt = $db->prepare('SELECT 1 FROM documentos WHERE id_documento = ?');
$stmt->bind_param('i', $id);
$stmt->execute();
$stmt->store_result();
$existe = $stmt->num_rows > 0;
$stmt->close();

if (!$existe) {
    responder(['ok' => false, 'error' => 'El documento no existe.'], 404);
}

// Primero el PDF y luego el registro (no dependemos del borrado en cascada)
$db->begin_transaction();
$stmt = $db->prepare('DELETE FROM archivos_pdf WHERE id_documento = ?');
$stmt->bind_param('i', $id);
$ok = $stmt->execute();
$stmt->close();

if ($ok) {
    $stmt = $db->prepare('DELETE FROM documentos WHERE id_documento = ?');
    $stmt->bind_param('i', $id);
    $ok = $stmt->execute();
    $stmt->close();
}
if (!$ok) {
    $db->rollback();
    responder(['ok' => false, 'error' => 'No se pudo eliminar el documento.'], 500);
}
$db->commit();
$db->close();

responder(['ok' => true]);
